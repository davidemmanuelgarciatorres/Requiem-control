"""Imágenes flotantes: validación, re-codificación sin metadatos, límite de 3, privacidad y preferencias."""

import io

from PIL import Image

from app.floaters import FloaterImageError, process_image


def photo(fmt="JPEG", size=(1200, 800), exif_gps=False) -> bytes:
    img = Image.new("RGB", size, (200, 80, 20))
    buf = io.BytesIO()
    kwargs = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x010F] = "CameraMaker"  # Make
        exif[0x8825] = {1: "N", 2: (19.0, 26.0, 0.0)}  # GPSInfo
        kwargs["exif"] = exif
    img.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


def test_process_image_resizes_and_strips_metadata():
    data, w, h = process_image(photo(exif_gps=True))
    assert max(w, h) == 256 and (w, h) == (256, 171)
    out = Image.open(io.BytesIO(data))
    assert out.format == "WEBP"
    assert not out.getexif() and "exif" not in out.info


def test_process_image_rejects_non_images_and_formats():
    for raw, code in [
        (b"", "floaters.empty"),
        (b"not an image", "floaters.invalid"),
        (photo("GIF", (10, 10)), "floaters.format"),
        (b"x" * (2 * 1024 * 1024 + 1), "floaters.too_large"),
    ]:
        try:
            process_image(raw)
        except FloaterImageError as e:
            assert e.code == code
        else:
            raise AssertionError(code)


def upload(client, content=None, name="foto.jpg"):
    headers = {"X-CSRF-Token": client.csrf}
    return client.http.post("/api/me/floaters", files={"file": (name, content or photo())}, headers=headers)


def test_upload_list_image_delete_and_limit(client):
    client.register("f@example.com")
    data = client.get("/api/me/floaters").json()
    assert data["images"] == [] and data["max_images"] == 3
    assert data["preferences"] == {
        "enabled": True,
        "size": 64,
        "speed": "normal",
        "effect_shape": "impact",
        "effect_color": "#ffd23f",
        "layer": "front",
    }
    ids = [upload(client).json()["id"] for _ in range(3)]
    r = upload(client)
    assert r.status_code == 409 and r.json()["error"]["code"] == "floaters.limit"
    img = client.get(f"/api/me/floaters/{ids[0]}/image")
    assert img.status_code == 200 and img.headers["content-type"] == "image/webp"
    assert "private" in img.headers["cache-control"]
    assert client.send("DELETE", f"/api/me/floaters/{ids[1]}").status_code == 204
    assert upload(client).json()["position"] == 1  # reutiliza el hueco libre
    assert [f["position"] for f in client.get("/api/me/floaters").json()["images"]] == [0, 1, 2]


def test_upload_requires_csrf_and_valid_image(client):
    client.register("g@example.com")
    r = client.http.post("/api/me/floaters", files={"file": ("x.jpg", photo())})
    assert r.status_code == 403
    r = upload(client, b"<svg onload=alert(1)>", "x.svg")
    assert r.status_code == 422 and r.json()["error"]["code"] == "floaters.invalid"


def test_preferences_are_validated_and_saved(client):
    client.register("p@example.com")
    prefs = {
        "enabled": True,
        "size": 96,
        "speed": "fast",
        "effect_shape": "hearts",
        "effect_color": "#39FF8F",
        "layer": "back",
    }
    assert client.send("PUT", "/api/me/preferences/floaters", json=prefs).status_code == 200
    assert client.get("/api/me/floaters").json()["preferences"] == prefs
    for bad in ({**prefs, "size": 500}, {**prefs, "effect_color": "red"}, {**prefs, "effect_shape": "bomb"}):
        assert client.send("PUT", "/api/me/preferences/floaters", json=bad).status_code == 422


def test_images_are_private_to_their_owner(make_client):
    a, b = make_client(), make_client()
    a.register("a@example.com")
    b.register("b@example.com")
    fid = upload(a).json()["id"]
    assert b.get(f"/api/me/floaters/{fid}/image").status_code == 404
    assert b.send("DELETE", f"/api/me/floaters/{fid}").status_code == 404
    assert b.get("/api/me/floaters").json()["images"] == []
