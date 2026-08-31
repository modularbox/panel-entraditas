import { Link } from "react-router-dom";

export function TermsPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl rounded-lg border-2 border-foreground bg-surface p-8 shadow-flat">
        <p className="font-display text-2xl font-semibold text-primary">entraditas</p>
        <h1 className="mt-1 text-xl font-semibold">Términos y condiciones</h1>

        <p className="mt-1 text-xs text-muted-foreground">Última actualización: 31 de agosto de 2026</p>

        <div className="mt-6 flex flex-col gap-4 text-sm text-muted-foreground">
          <section>
            <h2 className="font-semibold text-foreground">1. Objeto y aceptación</h2>
            <p className="mt-1">
              Estos términos regulan el acceso y uso del panel de administración de entraditas ("el panel") por
              parte de organizadores de eventos y su personal ("el usuario"). Al crear una cuenta o iniciar
              sesión, el usuario declara haber leído y aceptado estos términos en su totalidad. Si no está de
              acuerdo con alguna condición, no debe utilizar el panel.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">2. Cuentas de usuario</h2>
            <p className="mt-1">
              El acceso al panel se concede mediante invitación de un administrador de la organización. Cada
              usuario es responsable de mantener la confidencialidad de sus credenciales y de toda actividad
              realizada desde su cuenta. Debe notificar de inmediato cualquier uso no autorizado que detecte.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">3. Uso del servicio</h2>
            <p className="mt-1">
              El usuario se compromete a utilizar el panel de forma diligente y conforme a la ley, sin
              comprometer la seguridad de la plataforma, sin intentar acceder a datos de otras organizaciones y
              sin utilizar la información de asistentes y ventas con fines distintos a la gestión del evento.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">4. Propiedad intelectual</h2>
            <p className="mt-1">
              El software, el diseño y las marcas del panel son propiedad de entraditas. Se concede al usuario
              una licencia limitada, no exclusiva e intransferible para usar el panel exclusivamente en la
              gestión de sus propios eventos.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">5. Protección de datos</h2>
            <p className="mt-1">
              entraditas trata los datos personales de organizadores, personal y asistentes conforme a la
              normativa de protección de datos aplicable. El organizador es responsable de contar con base
              legítima para tratar los datos de sus propios asistentes.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">6. Responsabilidad</h2>
            <p className="mt-1">
              entraditas no se responsabiliza de los daños derivados de un uso indebido del panel por parte del
              organizador o su equipo, ni de decisiones tomadas por el organizador con la información disponible
              en el panel.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">7. Modificación de los términos</h2>
            <p className="mt-1">
              entraditas puede actualizar estos términos para reflejar cambios en el servicio o en la normativa
              aplicable. Se notificará a los usuarios con antelación razonable ante cambios sustanciales.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-foreground">8. Contacto</h2>
            <p className="mt-1">
              Para cualquier consulta sobre estos términos, escribe a soporte@entraditas.com.
            </p>
          </section>
        </div>

        <Link to="/login" className="mt-6 inline-block text-sm underline">
          Volver
        </Link>
      </div>
    </div>
  );
}
