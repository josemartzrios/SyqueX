# Patient Portal — Tutorial "Añadir a pantalla de inicio"

**Fecha:** 2026-05-07  
**Estado:** Aprobado

---

## Objetivo

Mostrar al paciente, la primera vez que entra al portal, un tutorial de un solo slide que lo guíe a añadir `https://app.syquex.mx/portal` a su pantalla de inicio. Un botón `?` en el header permite relanzarlo en cualquier momento.

---

## Decisiones de diseño

- **Reutilizar `TutorialModal`** con un nuevo prop `patientMode={true}`.
- **Sin prompt nativo de Chrome** (install PWA): el manifest tiene `start_url: "/"`, que abriría la app del psicólogo. Para evitar confusión, el tutorial siempre muestra instrucciones manuales.
- **localStorage separado**: `patient_tutorial_done` (distinto de `syquex_tutorial_done` del psicólogo).
- **Auto-show en primera visita**: PatientPortal verifica el flag al montar.

---

## Cambios

### `frontend/src/components/TutorialModal.jsx`

**Nuevo prop:** `patientMode: boolean` (default `false`).

**Comportamiento cuando `patientMode=true`:**

1. `slides` array contiene únicamente el slide PWA del paciente (no los 5 slides del psicólogo).
2. La barra de progreso multi-step no se muestra (un solo slide).
3. En `PWASlide`: se ignora `isInstallable` / `triggerInstall`. Siempre se renderizan instrucciones manuales.
4. El slide muestra la URL `https://app.syquex.mx/portal` de forma prominente (caja destacada).
5. `localStorage` key al cerrar: `patient_tutorial_done = "true"`.

**Contenido del slide (paciente):**

```
📲  Accede siempre desde tu celular

Tu portal está en:
  https://app.syquex.mx/portal

Instrucciones por sistema:
  iPhone — Compartir (□↑) → "Añadir a pantalla de inicio"
  Android — Menú (⋮) → "Añadir a pantalla de inicio"

Añádelo ahora para abrirlo con un toque.
```

La detección de navegador (Safari / Chrome / otro) sigue funcionando para mostrar las instrucciones del sistema correcto, pero no activa el prompt de instalación.

### `frontend/src/pages/PatientPortal.jsx`

1. **Import:** `import TutorialModal from '../components/TutorialModal'`
2. **Estado:** `const [tutorialVisible, setTutorialVisible] = useState(false)`
3. **Auto-show al montar:**
   ```js
   useEffect(() => {
     if (localStorage.getItem('patient_tutorial_done') !== 'true') {
       setTutorialVisible(true);
     }
   }, []);
   ```
4. **Botón `?` en el header** (mismo estilo que el del psicólogo):
   ```jsx
   <button
     onClick={() => setTutorialVisible(true)}
     className="w-8 h-8 rounded-full border border-ink/[0.07] text-ink-muted
                hover:text-ink hover:bg-ink/[0.05] transition-colors
                flex items-center justify-center flex-shrink-0"
     aria-label="Abrir tutorial"
   >?</button>
   ```
5. **Render del modal:**
   ```jsx
   <TutorialModal
     visible={tutorialVisible}
     onClose={() => setTutorialVisible(false)}
     isMobile={isMobile}
     patientMode
   />
   ```

---

## Comportamiento esperado

| Situación | Resultado |
|---|---|
| Primera visita al portal | Tutorial se abre automáticamente |
| Cierra el tutorial | `patient_tutorial_done = "true"` en localStorage; no vuelve a abrirse solo |
| Clic en `?` | Tutorial se abre manualmente (sin importar localStorage) |
| iPhone / Safari | Muestra pasos: Compartir → Añadir a pantalla de inicio |
| Android / Chrome | Muestra pasos manuales (Menú → Añadir); NO usa prompt nativo |
| Otro navegador | Muestra instrucciones genéricas de "Add to Home Screen" |

---

## Fuera de alcance

- Modificar el `manifest.json` o el `start_url`.
- Crear un manifest separado para el portal.
- Usar el prompt nativo de instalación de Chrome (`beforeinstallprompt`).
