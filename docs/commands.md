docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente

npm run dev 

uvicorn main:app --reload

\dt

SELECT invite_token FROM patient_users ORDER BY invited_at DESC LIMIT 1;

Paso 1 — Preparar el paciente (psicólogo en localhost:5173)
  - Abre un paciente → Editar expediente → agrega un email real (ej. test@test.com) → Guardar

  Paso 2 — Confirmar una nota y enviar resumen
  - Dicta una sesión → confirma la nota → en la sección "Resumen para [paciente]" → genera → envía

  Paso 3 — Obtener el token de invitación
  - Invita al paciente desde el modal de invitación del psicólogo
  - Luego en la terminal de Docker corre:
  docker exec -it syquex-postgres-1 psql -U psicoagente -d psicoagente -c "SELECT invite_token FROM patient_users ORDER BY invited_at DESC LIMIT 1;"

  Paso 4 — Probar el portal del paciente
  - Abre http://localhost:5173/portal/invite?token=<TOKEN_COPIADO>
  - Pon una contraseña → el sistema te redirige a /portal/login
  - Inicia sesión con el email del paciente + la contraseña que pusiste
  - Deberías ver los resúmenes enviados