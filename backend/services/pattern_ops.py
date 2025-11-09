from typing import Optional, Tuple
from PIL import Image
import math


def make_repeat(image: Image.Image, repeat: Optional[Tuple[int, int]] = None) -> Image.Image:
    """Tile the image to at least repeat (w,h) pixels. If repeat is None, return image.
    The output is cropped to exact repeat size.
    """
    if not repeat:
        return image
    rw, rh = repeat
    # Ensure we operate in RGB to avoid losing palette on 'P' mode composites
    base = image.convert('RGB') if image.mode == 'P' else image
    src_w, src_h = base.size
    tiles_x = max(1, math.ceil(rw / src_w))
    tiles_y = max(1, math.ceil(rh / src_h))
    out_mode = 'RGB' if base.mode == 'RGB' else base.mode
    out = Image.new(out_mode, (src_w * tiles_x, src_h * tiles_y))
    for y in range(tiles_y):
        for x in range(tiles_x):
            out.paste(base, (x * src_w, y * src_h))
    return out.crop((0, 0, rw, rh))
