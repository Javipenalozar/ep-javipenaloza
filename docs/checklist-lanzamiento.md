# Checklist de lanzamiento - PROGRAMA DE LIDERAZGO ES POSIBLE EP

Antes de hacer commit, push o deploy a Netlify, confirmar estos puntos.

## Supabase

- Ejecutar `supabase/portal-updates.sql` en el SQL editor.
- Confirmar tablas existentes:
  - `profiles`
  - `pending_participants`
  - `letters`
  - `evidence`
  - `reflections`
  - `metrics`
  - `metric_records`
  - `tickets`
  - `resources`
  - `consent_acceptances`
  - `support_records`
  - `resource_tool_records`
- Confirmar funciones RPC:
  - `activate_participant`
  - `preregister_participant`
  - `record_consent_acceptance`
  - `get_level_progress`
- Confirmar bucket:
  - `ticket-photos`
- Probar políticas RLS con tres roles:
  - participante: solo ve y edita su información.
  - staff: ve participantes asignados, reflexiones, cartas, indicadores y tickets de su equipo.
  - admin: ve todo.

## Consentimiento

- El PDF debe cargar desde:
  - `/consentimiento-informado-liderazgo-es-posible-ep.pdf`
- El participante no debe poder activar cuenta sin aceptar el checkbox.
- Al activar cuenta debe guardarse un registro en `consent_acceptances` con:
  - `user_id`
  - `consent_version`
  - `consent_pdf_path`
  - `accepted_at`
  - `metadata`

## Portal

- Activación por código crea usuario y perfil.
- Login con email y contraseña funciona.
- Carta de logros:
  - guarda en Supabase.
  - muestra resumen guardado.
  - PDF sale con diseño limpio.
- Indicadores:
  - guardan estado actual en `metrics`.
  - guardan record semanal en `metric_records`.
  - muestran historial por semana.
  - muestran semanas vencidas sin registro como "semana sin hacer indicadores".
  - la semana actual queda como pendiente hasta que el participante registre.
- Staff admin:
  - registra participante.
  - ve avances por participante como repositorio de solo lectura.
  - ve carta, semanas, reflexiones, niveles y último indicador.
  - ve acompañamientos y recursos trabajados en resumen.
  - no entra a modificar los formularios del participante.
- Niveles:
  - se completan automáticamente con `get_level_progress`.
  - el participante no puede marcarlos manualmente.
  - al completar Valioso aparece felicitación con el 4% del proceso.
- Tickets:
  - staff asigna ticket.
  - participante sube evidencia.
  - staff aprueba.
- Actividades pendientes:
  - participante ve guías cargadas en `resources` para niveles desbloqueados.
  - participante ve tickets pendientes o en revisión.
  - recursos futuros no aparecen hasta que el nivel se desbloquee por servidor.
- Acompañamiento:
  - participante guarda coaching individual.
  - participante guarda seguimiento psicológico.
  - participante guarda check-in buddy.
  - historial carga desde `support_records`.
- Recursos:
  - participante guarda diagnóstico.
  - participante guarda feedback 360.
  - participante guarda práctica realizada.
  - participante guarda proyecto de impacto.
  - historial carga desde `resource_tool_records`.

## GitHub y Netlify

- Revisar diff local antes de commit.
- Pedir autorización explícita antes de `git commit`.
- Pedir autorización explícita antes de `git push`.
- Pedir autorización explícita antes de deploy en Netlify.
- Confirmar dominio final:
  - `https://ep.javipenalozar.com`
