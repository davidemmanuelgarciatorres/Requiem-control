"""Validación segura de archivos subidos.

Reglas:
- El formato se detecta por el CONTENIDO (firma de bytes y estructura), nunca por el
  nombre ni por el tipo MIME que envía el cliente; la extensión solo debe coincidir.
- XLSX: debe ser un paquete OOXML real; se rechazan libros con macros (vbaProject.bin,
  tipos macroEnabled), archivos cifrados y archivos comprimidos desproporcionados
  (anti "zip bomb"). Nunca se ejecutan macros ni se evalúan fórmulas.
- CSV: debe ser texto (sin bytes nulos); se aceptan UTF-8 (con o sin BOM) y Windows-1252.
"""

import io
import zipfile
from dataclasses import dataclass
from typing import Literal

FileFormat = Literal["csv", "xlsx"]

OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # .xls antiguo o .xlsx cifrado
ZIP_SIGNATURE = b"PK\x03\x04"
MAX_ZIP_ENTRIES = 2000
MAX_COMPRESSION_RATIO = 100


class UploadRejected(Exception):
    """Archivo rechazado. `code` es estable (la interfaz lo traduce); `params` da contexto."""

    def __init__(self, code: str, message: str, **params: object) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.params = params


@dataclass(frozen=True)
class DetectedFile:
    format: FileFormat
    encoding: str | None = None  # solo CSV


def _extension(filename: str) -> str:
    name = filename.lower().rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    return name.rsplit(".", 1)[-1] if "." in name else ""


def detect(content: bytes, filename: str, *, max_bytes: int, max_uncompressed: int) -> DetectedFile:
    if not content:
        raise UploadRejected("upload.empty", "El archivo está vacío.")
    if len(content) > max_bytes:
        raise UploadRejected("upload.too_large", "El archivo supera el tamaño máximo.", limit_bytes=max_bytes)

    ext = _extension(filename)
    if ext in ("xlsm", "xlsb", "xltm"):
        raise UploadRejected("upload.macros_not_allowed", "No se aceptan libros con macros.")
    if ext not in ("csv", "txt", "xlsx"):
        raise UploadRejected("upload.unsupported_format", "Formato no admitido. Usa CSV o XLSX.")

    if content.startswith(OLE_SIGNATURE):
        raise UploadRejected(
            "upload.legacy_or_encrypted",
            "Libro .xls antiguo o protegido con contraseña. Guárdalo como .xlsx sin contraseña.",
        )

    if content.startswith(ZIP_SIGNATURE):
        if ext != "xlsx":
            raise UploadRejected("upload.extension_mismatch", "El contenido no coincide con la extensión del archivo.")
        _check_xlsx_package(content, max_uncompressed)
        return DetectedFile("xlsx")

    if ext == "xlsx":
        raise UploadRejected("upload.extension_mismatch", "El contenido no coincide con la extensión del archivo.")
    return DetectedFile("csv", _detect_text_encoding(content))


def _check_xlsx_package(content: bytes, max_uncompressed: int) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            infos = zf.infolist()
            if len(infos) > MAX_ZIP_ENTRIES:
                raise UploadRejected("upload.archive_suspicious", "El archivo tiene una estructura sospechosa.")
            names = {i.filename for i in infos}
            if "[Content_Types].xml" not in names or "xl/workbook.xml" not in names:
                raise UploadRejected("upload.unsupported_format", "No es un libro de Excel (.xlsx) válido.")
            if any(i.flag_bits & 0x1 for i in infos):
                raise UploadRejected("upload.legacy_or_encrypted", "El libro está cifrado.")
            if any(n.lower().endswith("vbaproject.bin") for n in names):
                raise UploadRejected("upload.macros_not_allowed", "No se aceptan libros con macros.")
            content_types = zf.read("[Content_Types].xml")
            if b"macroEnabled" in content_types or b"vbaProject" in content_types:
                raise UploadRejected("upload.macros_not_allowed", "No se aceptan libros con macros.")
            uncompressed = sum(i.file_size for i in infos)
            compressed = max(1, sum(i.compress_size for i in infos))
            if uncompressed > max_uncompressed or uncompressed / compressed > MAX_COMPRESSION_RATIO:
                raise UploadRejected("upload.archive_suspicious", "El archivo descomprimido es demasiado grande.")
    except zipfile.BadZipFile as e:
        raise UploadRejected("upload.corrupt", "El archivo está dañado o incompleto.") from e


def _detect_text_encoding(content: bytes) -> str:
    sample = content[:65536]
    if b"\x00" in sample:
        raise UploadRejected("upload.binary", "El archivo no es un CSV de texto.")
    try:
        content.decode("utf-8-sig")
        return "utf-8-sig"
    except UnicodeDecodeError:
        pass
    text = content.decode("cp1252", errors="replace")
    if text.count("�") > max(5, len(text) // 1000):
        raise UploadRejected("upload.encoding", "No se pudo leer la codificación del archivo. Guárdalo como CSV UTF-8.")
    return "cp1252"
