/*******************************************************************************
 * ---------------------------
 * Script "Pflanzen gie�en"
 * ---------------------------
 * Quelle: https://github.com/Mic-M/iobroker.pflanzen-giessen-script
 * Version: 0.1 (Changelog: siehe https://github.com/Mic-M/iobroker.pflanzen-giessen-script)
  ******************************************************************************/


/*******************************************************************************
 * Konfiguration: Pfade / Datenpunkte
 ******************************************************************************/
// Datenpunkte: Hauptpfad

const STATE_PATH = 'javascript.'+ instance + '.' + 'mic.PflanzenGiessen.';

// Datenpunkte: Einzelne Datenpunkte
const STATE_INTERVAL    =   STATE_PATH + 'wieOftGiessen';           // Number - Wie oft gie�en? Anzahl Tage
const STATE_RESTART     =   STATE_PATH + 'reStartCounter';          // true (Button) - Neustart Z�hler: Wir fangen neu an zu z�hlen, wird bet�tigt sobald die Pflanzen gegossen worden sind
const STATE_DUE         =   STATE_PATH + 'faellig';                 // true/false.  Wenn "faellig", dann m�ssen die Pflanzen gegossen werden. Wird false gesetzt, sobald Counter neu startet
const STATE_DAYS_DUE    =   STATE_PATH + 'anzahlTageBereitsFaellig';// Number.  Anzahl Tage, seit dem die Pflanzen gegossen werden m�ssten (aber es noch nicht sind)
const STATE_DAYS_LEFT   =   STATE_PATH + 'anzahlTageBisFaellig';    // Number.  Anzahl Tage, bis die Pflanzen gegossen werden m�ssen
const STATE_DATETIMESTART = STATE_PATH + 'datumZeitStartCounter';   // Date/Time.  Wann wurde der Timer gestartet

/*******************************************************************************
 * Konfiguration: Rest
 ******************************************************************************/

// Wie oft ausf�hren?
const PLANTS_SCHEDULE = "1 * * * *"; // Jede Stunde

// Logeintr�ge auf Debug setzen?
const M_DEBUG = true;

// Voreingestellte Anzahl Tage, nach denen gegossen werden muss.
// Kann jederzeit im State 'wieOftGiessen' ge�ndert werden.
const INTERVAL_PRESET = 7;


/*******************************************************************************
 * Ab hier nichts mehr �ndern / Stop editing here!
 ******************************************************************************/



/*******************************************************************************
 * Executed on every script start.
 *******************************************************************************/
init();
function init() {

    // Create states
    createScriptStates();

    // Main Script starten, 3s nach State-Generierung
    setTimeout(main, 3000);

}

/*******************************************************************************
 * Haupt-Skript
 *******************************************************************************/
var mSchedule;
function main() {

    /***************************
     * Schedule beenden falls aktiv, dann starten.
     * Dies machen wir, damit z.B. bei JavaScript-Adapter-Neustart immer sichergestellt ist, dass das Schedule l�uft.
     * Au�erdem initiales Start-Datum setzen, falls nicht vorhanden.
     **************************/
    clearSchedule(mSchedule);

    let dtStart = getState(STATE_DATETIMESTART).val;
    if ( (varIsNumber(dtStart)) && (dtStart > 0) ) {
        mSchedule = schedule(PLANTS_SCHEDULE, doIfScheduleDue);
        if (M_DEBUG) log('Startdatum im State "' + STATE_DATETIMESTART + '" vorhanden, daher wurde Schedule neu gestartet.');
    } else {
        // Initial ist noch kein Start-Datum gesetzt, also setzen wir eines mit Verz�gerung
        setStateDelayed(STATE_RESTART, true, 3000);
        if (M_DEBUG) log('Startdatum im State "' + STATE_DATETIMESTART + '" leer, daher wird das Startdatum jetzt frisch gesetzt.');
    }

    /***************************
     * �berwache State-Button reStartCounter
     **************************/
    on({id: STATE_RESTART, val:true}, function (obj) {
        setState(STATE_DATETIMESTART, Date.now());
        setTimeout(restartCounter(), 1000); // Damit das neue State-Datum auch gesetzt ist eine Sekunde Verz�gerung
        setStateDelayed(STATE_RESTART, false, 300); // wieder zur�ck setzen.
    });

    /***************************
     * �berwache State-Button wieOftGiessen, da diese Anzahl Tage vom User jederzeit ge�ndert werden k�nnen
     **************************/
    on({id: STATE_INTERVAL, change:"ne"}, function (obj) {
        restartCounter();
    });


    /***************************
     * F�hren wir aus, sobald der Counter wieder starten soll
     **************************/
    function restartCounter() {

        setState(STATE_DUE, false);
        setState(STATE_DAYS_DUE, 0);
        setState(STATE_DAYS_LEFT, getState(STATE_INTERVAL).val);

        // Alten Schedule l�schen
        clearSchedule(mSchedule);

        // Neuen Schedule starten
        mSchedule = schedule(PLANTS_SCHEDULE, doIfScheduleDue);

        if (M_DEBUG) log('Pflanzen Gie�en: Timer neu gestartet');

    }



    /***************************
     * Sobald die Planzen gegossen werden m�ssen, f�hren wir folgendes aus
     **************************/
    function doIfScheduleDue() {
        var startTimeInState = new Date(getState(STATE_DATETIMESTART).val);
        var intervalInState = getState(STATE_INTERVAL).val;
        var dateTimeDue = g_dateAddMinutes(startTimeInState, intervalInState*60*24);

        var numberOfMsDue = Date.now() - dateTimeDue;  // https://stackoverflow.com/questions/7709803/javascript-get-minutes-between-two-dates
        var numberOfMinutesDue = Math.floor((numberOfMsDue/1000)/60);
        var numberOfDaysDue = Math.round((numberOfMinutesDue/60)/24);

        var numberOfMsLeft      = dateTimeDue - Date.now();
        var numberOfMinutesLeft = Math.floor((numberOfMsLeft/1000)/60);
        var numberOfDaysLeft = Math.round((numberOfMinutesLeft/60)/24);

        setState(STATE_DAYS_DUE, numberOfDaysDue);
        setState(STATE_DAYS_LEFT, numberOfDaysLeft);
        if ( dateTimeDue < Date.now() ) {
            // Jetzt die Pflanzen gie�en
            setState(STATE_DUE, true);
            if (M_DEBUG) log('Pflanzen Gie�en: Schedule - Pflanzen gie�en f�llig seit ' + numberOfDaysDue + ' Tagen');
        } else {
            // Pflanzen noch nicht gie�en
            setState(STATE_DUE, false);
            if (M_DEBUG) log('Pflanzen Gie�en: Schedule - Pflanzen gie�en noch nicht f�llig, erst in ' + numberOfDaysLeft + ' Tagen');
        }

        if (M_DEBUG) log('Pflanzen Gie�en: Pr�fung durchgef�ht, ob Pflanzen gegossen werden m�ssen');

    }



}

/*******************************************************************************
 * Weitere unterst�tzende Funktionen usw.
 *******************************************************************************/


/**
 * Add minutes to a given date/time
 * @param {date}    date      date
 * @param {number}  minutes   number of minutes to be added to a given date
 * @return {date}   new date with the minutes added
 */
function g_dateAddMinutes(date, minutes) {
    return new Date(date.getTime() + minutes*60000);
}

/**
 * Pr�ft ob Variableninhalt eine Zahl ist.
 * @param {any} Variable, die zu pr�fen ist auf Zahl
 * @return true falls Zahl, false falls nicht.
 * isNumber ('123'); // true
 * isNumber ('123abc'); // false
 * isNumber (5); // true
 * isNumber ('q345'); // false
 * isNumber(null); // false
 * isNumber(undefined); // false
 * isNumber(false); // false
 * isNumber('   '); // false
 * @source https://stackoverflow.com/questions/1303646/check-whether-variable-is-number-or-string-in-javascript
 */
function varIsNumber(n) {
    return /^-?[\d.]+(?:e-?\d+)?$/.test(n);
}

/**
 * Create states needed for this script
 */
function createScriptStates() {
    createState(STATE_INTERVAL, {'name':'Wie oft gie�en? Anzahl Tage', 'type':'number', 'unit':'d', 'min':1, 'max':60, 'read':true, 'write':true, 'role':'value', 'def':INTERVAL_PRESET });
    createState(STATE_RESTART, {'name':'Z�hler (neu) starten', 'type':'boolean', 'read':true, 'write':true, 'role':'button', 'def':false });
    createState(STATE_DUE, {'name':'Pflanzen gie�en n�tig?', 'type':'boolean', 'read':true, 'write':false, 'role':'state' });
    createState(STATE_DAYS_DUE, {'name':'Anzahl Tage, seit dem die Pflanzen gegossen werden m�ssen', 'type':'number', 'unit':'d', 'min':0, 'max':9999, 'read':true, 'write':false, 'role':'value', 'def':0 });
    createState(STATE_DAYS_LEFT, {'name':'Anzahl Tage, bis die Pflanzen gegossen werden m�ssen', 'type':'number', 'unit':'d', 'min':0, 'max':9999, 'read':true, 'write':false, 'role':'value', 'def':0 });
    createState(STATE_DATETIMESTART, {'name':'Wann wurde der Timer gestartet', 'type':'number', 'read':true, 'write':false, 'role':'value.time'});
}

