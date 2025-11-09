from typing import List, Optional
from PIL import Image
import numpy as np


def _srgb_to_xyz(c: np.ndarray) -> np.ndarray:
    c = c / 255.0
    mask = c <= 0.04045
    c = np.where(mask, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    # sRGB D65 matrix
    M = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    return c @ M.T


def _xyz_to_lab(xyz: np.ndarray) -> np.ndarray:
    # D65 reference white
    ref = np.array([0.95047, 1.00000, 1.08883])
    x = xyz / ref
    eps = 216/24389
    kappa = 24389/27

    def f(t):
        return np.where(t > eps, np.cbrt(t), (kappa * t + 16) / 116)

    fx, fy, fz = f(x[..., 0]), f(x[..., 1]), f(x[..., 2])
    L = 116 * fy - 16
    a = 500 * (fx - fy)
    b = 200 * (fy - fz)
    return np.stack([L, a, b], axis=-1)


def _rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    xyz = _srgb_to_xyz(rgb.astype(np.float64))
    return _xyz_to_lab(xyz)


def _build_palette_image(palette: List[tuple]) -> Image.Image:
    # palette: list of (r,g,b)
    pal_img = Image.new('P', (1, 1))
    flat = []
    for (r, g, b) in palette[:256]:
        flat.extend([int(r), int(g), int(b)])
    # pad to 256*3
    while len(flat) < 256 * 3:
        flat.extend([0, 0, 0])
    pal_img.putpalette(flat)
    return pal_img


def _snap_image_to_palette(img: Image.Image, palette: List[tuple], dither: bool = False, delta_e_tolerance: Optional[float] = None) -> Image.Image:
    """Map each pixel to nearest palette color (by DeltaE CIE76 if requested, else RGB distance), return palettized image."""
    arr = np.array(img.convert('RGB'))
    H, W, _ = arr.shape
    prgb = np.array(palette, dtype=np.uint8)
    # Prepare distances in Lab if requested
    if delta_e_tolerance is not None:
        img_lab = _rgb_to_lab(arr.reshape(-1, 3))  # (N,3)
        pal_lab = _rgb_to_lab(prgb.reshape(-1, 3))  # (K,3)
        # compute squared distances
        # (N,1,3) - (1,K,3) -> (N,K,3)
        diff = img_lab[:, None, :] - pal_lab[None, :, :]
        dist2 = np.sum(diff * diff, axis=-1)  # (N,K)
        idx = np.argmin(dist2, axis=1)
        mapped = prgb[idx]
    else:
        # Euclidean in RGB
        flat = arr.reshape(-1, 3).astype(np.int16)
        pal = prgb.astype(np.int16)
        # (N,1,3) - (1,K,3)
        diff = flat[:, None, :] - pal[None, :, :]
        dist2 = np.sum(diff * diff, axis=-1)
        idx = np.argmin(dist2, axis=1)
        mapped = prgb[idx]

    mapped_img = mapped.reshape(H, W, 3).astype(np.uint8)
    out = Image.fromarray(mapped_img, mode='RGB')
    # optional dithering: apply PIL quantize with provided palette to add ordered dithering if requested
    pal_img = _build_palette_image(palette)
    dither_mode = Image.FLOYDSTEINBERG if dither else Image.NONE
    return out.quantize(palette=pal_img, dither=dither_mode)


def quantize_to_palette(
    image_path: str,
    palette: Optional[List[tuple]] = None,
    max_colors: int = 256,
    dither: bool = False,
    delta_e_tolerance: Optional[float] = None,
) -> Image.Image:
    """Load image and return a palettized ('P' mode) image with up to 256 colors.
    If palette is provided, snap to that palette; otherwise use PIL quantize with k=max_colors.
    """
    img = Image.open(image_path).convert('RGB')
    if palette:
        # If delta_e_tolerance is provided, use CIE76 snapping; else use direct palette quantize
        if delta_e_tolerance is not None:
            return _snap_image_to_palette(img, palette, dither=dither, delta_e_tolerance=delta_e_tolerance)
        else:
            pal_img = _build_palette_image(palette)
            dither_mode = Image.FLOYDSTEINBERG if dither else Image.NONE
            q = img.quantize(palette=pal_img, dither=dither_mode)
            return q
    else:
        dither_mode = Image.FLOYDSTEINBERG if dither else Image.NONE
        colors = max(2, min(256, int(max_colors)))
        q = img.quantize(colors=colors, method=Image.MEDIANCUT, dither=dither_mode)
        return q
