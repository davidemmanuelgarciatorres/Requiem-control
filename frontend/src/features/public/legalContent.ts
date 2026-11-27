/**
 * Plantillas del aviso de privacidad y de los términos. Los datos del responsable vienen del
 * servidor (/api/legal); si faltan se muestran marcadores visibles como «[RAZÓN SOCIAL]».
 * Deben revisarse con un abogado antes de publicar: no constituyen asesoría legal.
 */
export type LegalInfo = { entity_name: string | null; address: string | null; contact_email: string | null; updated_on: string | null; complete: boolean };
export type LegalSection = { title: string; body: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

type Vars = { entity: string; address: string; email: string };

const PRIVACY_ES = (v: Vars): LegalDoc => ({
  title: 'Aviso de privacidad',
  intro: `${v.entity}, con domicilio en ${v.address}, es responsable del tratamiento de los datos personales que se recaban a través de REQUIEM CONTROL, conforme a la legislación mexicana aplicable en materia de protección de datos personales.`,
  sections: [
    { title: 'Datos que tratamos', body: [
      'Datos de cuenta: nombre, correo electrónico y tu contraseña, que se guarda únicamente como un resumen criptográfico (nunca en texto legible).',
      'Información de tu negocio que tú decides cargar (por ejemplo, archivos de ventas, inventario o clientes) y los reportes que se generan con ella.',
      'Si conectas Google, los permisos que autorices (Hojas de cálculo, Drive o Gmail). Los accesos se guardan cifrados y puedes desconectarlos en cualquier momento.',
      'Datos de pago: los procesa Stripe. REQUIEM CONTROL no recibe ni guarda los datos de tu tarjeta.',
      'Datos técnicos: dirección IP, navegador y un registro de actividad de seguridad (inicios de sesión y cambios relevantes).',
    ] },
    { title: 'Para qué los usamos', body: [
      'Prestarte el servicio: crear tu cuenta, analizar la información que cargas, generar reportes y ejecutar las acciones que tú apruebes.',
      'Proteger tu cuenta y la plataforma: autenticación, prevención de abusos y auditoría.',
      'Cobrar la suscripción cuando eliges un plan de pago y enviarte correos necesarios (recuperación de contraseña, confirmación de correo e invitaciones).',
      'No vendemos tus datos ni los usamos para publicidad.',
    ] },
    { title: 'Inteligencia artificial', body: [
      'Algunas funciones generan textos con un proveedor de inteligencia artificial. Para hacerlo se le envía la información mínima necesaria (por ejemplo, un resumen de los resultados de un análisis o la pregunta que escribes). Ninguna acción con efectos se ejecuta sin tu aprobación.',
    ] },
    { title: 'Con quién se comparten', body: [
      'Solo con proveedores que nos ayudan a operar el servicio y que actúan por nuestra cuenta: alojamiento y base de datos, envío de correo, procesamiento de pagos (Stripe), el proveedor de inteligencia artificial configurado y Google, únicamente si tú conectas tu cuenta.',
      'También podríamos comunicarlos cuando lo exija una autoridad competente conforme a la ley.',
    ] },
    { title: 'Tus derechos (ARCO)', body: [
      `Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos, así como revocar tu consentimiento, escribiendo a ${v.email}. Responderemos dentro de los plazos que marca la ley.`,
      'Desde Configuración puedes corregir tu nombre, exportar los datos de tu organización y eliminarla con toda su información.',
    ] },
    { title: 'Cookies y almacenamiento local', body: [
      'Usamos una cookie de sesión indispensable para mantenerte conectado y el almacenamiento del navegador para recordar tus preferencias (idioma o apariencia). No usamos cookies de rastreo ni de publicidad.',
    ] },
    { title: 'Seguridad y conservación', body: [
      'La información de cada organización está aislada de las demás, las conexiones van cifradas y los accesos a servicios externos se guardan cifrados. Conservamos los datos mientras tu cuenta esté activa o mientras la ley lo requiera.',
    ] },
    { title: 'Cambios a este aviso', body: ['Publicaremos cualquier cambio en esta página indicando la fecha de actualización.'] },
  ],
});

const PRIVACY_EN = (v: Vars): LegalDoc => ({
  title: 'Privacy notice',
  intro: `${v.entity}, located at ${v.address}, is responsible for the personal data collected through REQUIEM CONTROL, in accordance with applicable Mexican data protection law.`,
  sections: [
    { title: 'Data we process', body: [
      'Account data: name, email and your password, which is stored only as a cryptographic hash (never in readable form).',
      'Business information you choose to upload (for example sales, inventory or customer files) and the reports generated from it.',
      'If you connect Google, the permissions you authorize (Sheets, Drive or Gmail). Access tokens are stored encrypted and you can disconnect at any time.',
      'Payment data is processed by Stripe. REQUIEM CONTROL never receives or stores your card details.',
      'Technical data: IP address, browser and a security activity log (sign-ins and relevant changes).',
    ] },
    { title: 'How we use it', body: [
      'To provide the service: create your account, analyze the information you upload, generate reports and run the actions you approve.',
      'To protect your account and the platform: authentication, abuse prevention and auditing.',
      'To charge your subscription when you choose a paid plan and to send necessary emails (password recovery, email confirmation and invitations).',
      'We do not sell your data or use it for advertising.',
    ] },
    { title: 'Artificial intelligence', body: [
      'Some features generate text with an artificial intelligence provider. Only the minimum necessary information is sent (for example a summary of an analysis or the question you type). No action with real effects runs without your approval.',
    ] },
    { title: 'Who we share it with', body: [
      'Only with providers that help us operate the service on our behalf: hosting and database, email delivery, payment processing (Stripe), the configured artificial intelligence provider and Google, only if you connect your account.',
      'We may also disclose data when required by a competent authority under the law.',
    ] },
    { title: 'Your rights', body: [
      `You can access, rectify, cancel or object to the processing of your data, and revoke your consent, by writing to ${v.email}. We will reply within the legal deadlines.`,
      'From Settings you can correct your name, export your organization data and delete it with all its information.',
    ] },
    { title: 'Cookies and local storage', body: [
      'We use one essential session cookie to keep you signed in and browser storage to remember your preferences (language or appearance). We do not use tracking or advertising cookies.',
    ] },
    { title: 'Security and retention', body: [
      'Each organization’s information is isolated from the others, connections are encrypted and access to external services is stored encrypted. We keep data while your account is active or as long as the law requires.',
    ] },
    { title: 'Changes to this notice', body: ['We will publish any change on this page with its update date.'] },
  ],
});

const TERMS_ES = (v: Vars): LegalDoc => ({
  title: 'Términos y condiciones',
  intro: `Estos términos regulan el uso de REQUIEM CONTROL, servicio ofrecido por ${v.entity}. Al crear una cuenta los aceptas.`,
  sections: [
    { title: 'El servicio', body: [
      'REQUIEM CONTROL te ayuda a analizar la información de tu negocio y propone acciones mediante agentes de inteligencia artificial. Las acciones con efectos reales (por ejemplo, crear un borrador de correo o guardar una lista) solo se realizan cuando una persona autorizada las aprueba.',
    ] },
    { title: 'Tu cuenta', body: [
      'Debes proporcionar datos verdaderos y cuidar tu contraseña. Eres responsable de lo que ocurra con tu cuenta y de los permisos que das a otros miembros de tu organización.',
    ] },
    { title: 'Planes y pagos', body: [
      'El plan Gratis tiene límites de uso. El plan Premium se cobra por mes adelantado en pesos mexicanos a través de Stripe y se renueva automáticamente. Los impuestos aplicables se muestran al pagar.',
      'Puedes cancelar cuando quieras desde Configuración; la cancelación surte efecto al terminar el periodo ya pagado y no genera cargos adicionales.',
    ] },
    { title: 'Tus datos', body: [
      'La información que cargas es tuya. Nos das permiso únicamente para procesarla con el fin de prestarte el servicio, como se describe en el Aviso de privacidad. Puedes exportarla o eliminarla en cualquier momento.',
    ] },
    { title: 'Uso aceptable', body: [
      'No puedes usar el servicio para actividades ilegales, para enviar correo no solicitado, para intentar acceder a información de otras organizaciones ni para afectar su funcionamiento.',
    ] },
    { title: 'Resultados de la inteligencia artificial', body: [
      'Los análisis y recomendaciones son orientativos y dependen de la calidad de los datos. Revísalos antes de tomar decisiones; las decisiones de tu negocio son tuyas.',
    ] },
    { title: 'Disponibilidad y responsabilidad', body: [
      'Trabajamos para que el servicio esté disponible y seguro, pero puede haber interrupciones. En la medida que permita la ley, nuestra responsabilidad se limita al monto que hayas pagado en los últimos doce meses.',
    ] },
    { title: 'Terminación', body: [
      'Puedes eliminar tu organización en cualquier momento. Podemos suspender cuentas que incumplan estos términos, avisándote cuando sea posible.',
    ] },
    { title: 'Ley aplicable y contacto', body: [
      `Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier duda escribe a ${v.email}.`,
    ] },
  ],
});

const TERMS_EN = (v: Vars): LegalDoc => ({
  title: 'Terms and conditions',
  intro: `These terms govern the use of REQUIEM CONTROL, a service offered by ${v.entity}. By creating an account you accept them.`,
  sections: [
    { title: 'The service', body: [
      'REQUIEM CONTROL helps you analyze your business information and proposes actions through artificial intelligence agents. Actions with real effects (for example creating an email draft or saving a list) only happen when an authorized person approves them.',
    ] },
    { title: 'Your account', body: [
      'You must provide accurate information and keep your password safe. You are responsible for activity in your account and for the permissions you give other members of your organization.',
    ] },
    { title: 'Plans and payments', body: [
      'The Free plan has usage limits. The Premium plan is billed monthly in advance in Mexican pesos through Stripe and renews automatically. Applicable taxes are shown at checkout.',
      'You can cancel anytime from Settings; cancellation takes effect at the end of the paid period with no additional charges.',
    ] },
    { title: 'Your data', body: [
      'The information you upload is yours. You allow us to process it only to provide the service, as described in the Privacy notice. You can export or delete it at any time.',
    ] },
    { title: 'Acceptable use', body: [
      'You may not use the service for illegal activities, to send unsolicited email, to try to access other organizations’ information or to disrupt its operation.',
    ] },
    { title: 'Artificial intelligence results', body: [
      'Analyses and recommendations are guidance and depend on data quality. Review them before deciding; your business decisions are yours.',
    ] },
    { title: 'Availability and liability', body: [
      'We work to keep the service available and secure, but interruptions may happen. To the extent permitted by law, our liability is limited to the amount you paid in the last twelve months.',
    ] },
    { title: 'Termination', body: [
      'You can delete your organization at any time. We may suspend accounts that breach these terms, notifying you when possible.',
    ] },
    { title: 'Governing law and contact', body: [
      `These terms are governed by the laws of the United Mexican States. For any question write to ${v.email}.`,
    ] },
  ],
});

export function legalDoc(kind: 'privacy' | 'terms', lang: 'es' | 'en', info: LegalInfo | null): LegalDoc {
  const es = lang === 'es';
  const v: Vars = {
    entity: info?.entity_name || (es ? '[RAZÓN SOCIAL]' : '[LEGAL ENTITY NAME]'),
    address: info?.address || (es ? '[DOMICILIO]' : '[ADDRESS]'),
    email: info?.contact_email || (es ? '[CORREO DE CONTACTO]' : '[CONTACT EMAIL]'),
  };
  const make = kind === 'privacy' ? (es ? PRIVACY_ES : PRIVACY_EN) : es ? TERMS_ES : TERMS_EN;
  return make(v);
}
