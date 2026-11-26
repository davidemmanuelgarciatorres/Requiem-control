"""Proceso de trabajo (worker): ejecuta agentes en cola fuera del servidor web.

Uso:  EXECUTION_MODE=worker python -m app.worker
- Toma ejecuciones una por una con `claim_next_execution()` (seguro con varios workers a la vez).
- Cada ejecución corre en su propia transacción con el contexto RLS de su organización.
- Cada minuto marca como interrumpidas las que quedaron colgadas si un worker se cayó.
- También dispara las automatizaciones programadas que ya vencieron (Fase 7).
- Se detiene limpiamente con SIGINT/SIGTERM (termina la ejecución en curso).
"""

import logging
import signal
import time
from datetime import timedelta
from types import FrameType

from sqlalchemy import text

from app.agents import runner
from app.config import get_settings
from app.db import _session_factory

log = logging.getLogger("requiem.worker")
_stop = False


def _handle(signum: int, frame: FrameType | None) -> None:
    global _stop
    _stop = True
    log.info("Señal %s recibida: terminando tras la ejecución en curso", signum)


def fail_stale() -> int:
    minutes = get_settings().worker_stale_minutes
    db = _session_factory()()
    try:
        n = int(
            db.execute(text("SELECT fail_stale_executions(:age)"), {"age": timedelta(minutes=minutes)}).scalar_one()
        )
        db.commit()
        return n
    finally:
        db.close()


def run_once() -> bool:
    """Procesa como máximo una ejecución. Devuelve True si había trabajo."""
    db = _session_factory()()
    try:
        row = db.execute(text("SELECT execution_id, organization_id, user_id FROM claim_next_execution()")).first()
        db.commit()
    finally:
        db.close()
    if row is None:
        return False
    log.info("Ejecutando %s", row.execution_id)
    runner.run_execution(row.execution_id, row.organization_id, row.user_id)
    return True


def tick_automations() -> int:
    """Encola las automatizaciones vencidas (Fase 7). Devuelve cuántas se dispararon."""
    from app import automations  # importación diferida: módulo de la Fase 7

    return automations.run_due()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    signal.signal(signal.SIGINT, _handle)
    signal.signal(signal.SIGTERM, _handle)
    s = get_settings()
    log.info("Worker iniciado (sondeo cada %.1f s)", s.worker_poll_seconds)
    last_maintenance = 0.0
    while not _stop:
        now = time.monotonic()
        if now - last_maintenance >= 60:
            last_maintenance = now
            try:
                if n := fail_stale():
                    log.warning("%s ejecuciones interrumpidas marcadas como fallidas", n)
                if k := tick_automations():
                    log.info("%s automatizaciones disparadas", k)
            except Exception:
                log.exception("Error en mantenimiento")
        try:
            worked = run_once()
        except Exception:
            log.exception("Error al procesar la cola")
            worked = False
        if not worked:
            time.sleep(s.worker_poll_seconds)
    log.info("Worker detenido")


if __name__ == "__main__":
    main()
