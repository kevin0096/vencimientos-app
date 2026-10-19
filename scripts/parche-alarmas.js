// Parche del plugin @capacitor/local-notifications: usa setAlarmClock en lugar de
// setExactAndAllowWhileIdle. Con el celular en reposo (Doze), Android solo deja sonar
// una alarma "exact while idle" cada ~9 minutos por app, y las demás de las 9 pm
// se retrasaban hasta la mañana. setAlarmClock no tiene esa limitación.
// Se ejecuta solo en "npm install" (postinstall). Luego: npx cap sync android y recompilar el APK.
const fs = require('fs');
const f = 'node_modules/@capacitor/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/LocalNotificationManager.java';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('setAlarmClock')) { console.log('parche-alarmas: ya aplicado'); process.exit(0); }
const viejo = 'alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pendingIntent);';
if (!s.includes(viejo)) { console.error('parche-alarmas: no se encontró el código esperado del plugin'); process.exit(1); }
s = s.replace(viejo, `Intent abrir = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                PendingIntent mostrar = PendingIntent.getActivity(
                    context, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                alarmManager.setAlarmClock(new AlarmManager.AlarmClockInfo(trigger, mostrar), pendingIntent);`);
fs.writeFileSync(f, s);
console.log('parche-alarmas: aplicado');
