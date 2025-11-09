from PIL import Image
import os

def save_bmp8(p_img: Image.Image, out_path: str) -> str:
    """Save a palettized ('P' mode) image as 8-bit indexed BMP.
    Returns the written path.
    """
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # Ensure 'P' mode; Pillow will write indexed BMP
    img = p_img
    if img.mode != 'P':
        img = img.convert('P')
    img.save(out_path, format='BMP')
    return out_path
