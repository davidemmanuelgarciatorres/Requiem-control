"""Procesamiento seguro de las imágenes flotantes del usuario.

El navegador ya recorta y reduce la imagen, pero el servidor NO confía en ello:
- verifica que sea una imagen real (Pillow) de un formato permitido;
- limita dimensiones (anti "bomba de descompresión");
- corrige la orientación y la vuelve a codificar como WebP ≤ 256 px,
  descartando TODOS los metadatos (EXIF, GPS, perfiles).
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_SOURCE_PIXELS = 16_000_000
MAX_SIDE = 256
ALLOWED_FORMATS = {"WEBP", "PNG", "JPEG"}
MAX_FLOATERS = 3


class FloaterImageError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def process_image(raw: bytes) -> tuple[bytes, int, int]:
    if not raw:
        raise FloaterImageError("floaters.empty", "La imagen está vacía.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise FloaterImageError("floaters.too_large", "La imagen es demasiado grande.")
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            fmt = probe.format
            w, h = probe.size
            probe.verify()  # estructura válida
    except (UnidentifiedImageError, OSError, SyntaxError) as e:
        raise FloaterImageError("floaters.invalid", "El archivo no es una imagen válida.") from e
    if fmt not in ALLOWED_FORMATS:
        raise FloaterImageError("floaters.format", "Formato no admitido. Usa JPG, PNG o WebP.")
    if w * h > MAX_SOURCE_PIXELS:
        raise FloaterImageError("floaters.dimensions", "La imagen tiene demasiados píxeles.")

    with Image.open(io.BytesIO(raw)) as source:
        oriented = ImageOps.exif_transpose(source)  # respeta la orientación de la cámara
        img: Image.Image = oriented.convert("RGBA")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    # Guardar sin `exif`/`icc_profile`: se eliminan los metadatos de la foto original.
    img.save(out, format="WEBP", quality=85, method=6)
    return out.getvalue(), img.width, img.height
