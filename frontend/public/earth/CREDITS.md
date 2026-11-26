# Texturas de la Tierra — procedencia

| Archivo | Contenido | Origen |
|---|---|---|
| `earth-day.webp` | Superficie diurna (2048×1024) | NASA Blue Marble (imagen de dominio público de NASA), tomada de la copia distribuida en el paquete npm `three-globe` 2.45.6 (`example/img/earth-blue-marble.jpg`, licencia del paquete: MIT). |
| `earth-night.webp` | Intensidad de luces de ciudad (escala de grises) | NASA Black Marble / Earth at Night (dominio público de NASA), de `three-globe` (`example/img/earth-night.jpg`). Se extrajo el canal rojo con umbral para quitar el hielo y el océano y dejar solo las luces artificiales. |
| `earth-masks.webp` | R = máscara de agua, G = nubes | `three-globe` (`example/img/earth-water.png` y `example/clouds/clouds.png`, canal alfa). |

Todas se redimensionaron y convirtieron a WebP con Pillow. Las imágenes de la NASA no requieren licencia;
NASA pide citarla como fuente: “Imagen: NASA Visible Earth / Earth Observatory”. No se verificó de forma
independiente la cadena de procedencia de las copias incluidas en `three-globe`.
