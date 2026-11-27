import logoUrl from '../../assets/logo.png';

/** Logotipo de REQUIEM CONTROL (estrella). Decorativo: el nombre siempre aparece como texto al lado o en la etiqueta. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return <img className="rc-brand__mark" src={logoUrl} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
