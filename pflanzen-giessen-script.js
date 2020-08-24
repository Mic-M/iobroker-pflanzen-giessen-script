/**************************************************************************************************
 * Script "Timer" (ehemals: "Pflanzen gießen")
 * -------------------------------------------------------------------------------------
 * Quelle: https://github.com/Mic-M/iobroker.pflanzen-giessen-script
 * Support: https://forum.iobroker.net/topic/16470/
 * Autor:            Mic (ioBroker) | Mic-M (github)
 * Change Log
 *  0.3 Mic  Support creating states under 0_userdata.0
 *  0.2 Mic  Diverse Verbesserungen
 *  0.1 Mic  Initial version
 **************************************************************************************************/


/*******************************************************************************
 * Konfiguration: Pfade / Datenpunkte
 ******************************************************************************/
// Pfad, unter dem die States (Datenpunkte) in den Objekten angelegt werden.
// Es wird die Anlage sowohl unterhalb '0_userdata.0' als auch 'javascript.x' unterstützt.
//const STATE_PATH = 'javascript.'+ instance + '.' + 'VIS.Timer';
const STATE_PATH = '0_userdata.0.Geräte.Tablets.Timer';

// Beliebig viele einzelne Timer anlegen.
// Zeilen leer lassen oder löschen, falls nicht benötigt.
const TIMERS = [
    {'state': 'Pflanzen', 'name': 'Pflanzen gießen'},
    {'state': '', 'name': ''},
    {'state': '', 'name': ''},
];


// Datenpunkte: Einzelne Datenpunkte.
// Kein Grund zur Änderung! Einfach so belassen.
const STATE_INTERVAL        = 'interval';           // Number - Wie oft gießen? Anzahl Tage
const STATE_RESTART         = 'reStartCounter';     // true (Button) - Neustart Zähler: Wir fangen neu an zu zählen, wird betätigt sobald die Pflanzen gegossen worden sind
const STATE_OVERDUE         = 'isOverdue';          // true/false.  Wenn "faellig", dann müssen die Pflanzen gegossen werden. Wird false gesetzt, sobald Counter neu startet
const STATE_PERCENT_ELAPSED = 'percentElapsed';     // Wann fällig, in %. D.h. bei 10 Tagen 'anzahlTageBisFaellig', und vor 3 Tagen gegossen = 30%
const STATE_DAYS_OVERDUE    = 'daysOverdue';        // Number.  Anzahl Tage, seit dem die Pflanzen gegossen werden müssten (aber es noch nicht sind)
const STATE_DAYS_LEFT       = 'daysLeft';           // Number.  Anzahl Tage, bis die Pflanzen gegossen werden müssen
const STATE_DAYS_ELAPSED    = 'daysElapsed';        // Number.  Anzahl Tage, seit dem der Timer gestartet wurde
const STATE_DATETIMESTART   = 'dateTimeCounterStart';   // Date/Time.  Wann wurde der Timer gestartet
const STATE_LEVEL           = 'level';              // Grün / Gelb / Rot, je nach % vergangen. Siehe Konfiguration Schwellwerte


/*******************************************************************************
 * Konfiguration: Rest
 ******************************************************************************/

// Schwellwerte in %: Im Datenpunkt ".level" wird green/yellow/red ausgegeben, je nach Datenpunkt 'faelligProzent'.
// Bitte einen Bereich angeben: [20, 40]: Bedeutet, dass %-Wert zwischen 20 und 40 liegen muss.
const LEVEL_GREEN =  [0, 85];
const LEVEL_YELLOW = [86, 99];
const LEVEL_RED =    [100, 99999999];



// Wie oft aktualisieren?
const PLANTS_SCHEDULE = '5 */3 * * *'; // Alle 3 Stunden.

// Logeinträge anzeigen?
const LOGINFO = false;

// Default: Anzahl Tage.
// Kann jederzeit im State 'interval' geändert werden.
const INTERVAL_PRESET = 14;


/*************************************************************************************************************************
 * Ab hier nichts mehr ändern / Stop editing here!
 *************************************************************************************************************************/

/****************************************************************************************
 * Global variables and constants
 ****************************************************************************************/
// Final state path
const FINAL_STATE_LOCATION = validateStatePath(STATE_PATH, false);
const FINAL_STATE_PATH = validateStatePath(STATE_PATH, true) + '.'; // adding trailing dot

// Schedule
let mSchedule = [];


/*******************************************************************************
 * Executed on every script start.
 *******************************************************************************/
init();
function init() {
 
    // Create states
    createUserStates(FINAL_STATE_LOCATION, false, buildScriptStates(), function() {

        // Main Script starten
        setTimeout(main, 2000);

    });
    
}

/*******************************************************************************
 * Haupt-Skript
 *******************************************************************************/
function main() {

    for (let i = 0; i < TIMERS.length; i++) {

        // First: check if we have a valid configuration
        // TO DO: Further check TIMERS[i].state for valid state chars
        if (isLikeEmpty(TIMERS[i].state)) {
            continue; // breaks current iteration in the loop and continues with the next
        }

        /***************************
         * Schedule beenden falls aktiv, dann starten.
         * Dies machen wir, damit z.B. bei JavaScript-Adapter-Neustart immer sichergestellt ist, dass das Schedule läuft.
         * Außerdem initiales Start-Datum setzen, falls nicht vorhanden.
         **************************/
        clearSchedule(mSchedule[i]);

        let dtStart = getState(FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_DATETIMESTART).val;
        if ( (isNumber(dtStart)) && (dtStart > 0) ) {
            mSchedule[i] = schedule(PLANTS_SCHEDULE, function() {
                updateStates(TIMERS[i]);
            });
            if (LOGINFO) log('Timer ' + TIMERS[i].name + ': Script wurde neu gestartet. Ein Timer-Startdatum ist vorhanden, also wird nur aktualisiert.');
            updateStates(TIMERS[i]);
        } else {
            // Initial ist noch kein Start-Datum gesetzt, also setzen wir eines.
            setState(FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_DATETIMESTART, Date.now()); // Dies triggert automatisch updateStates(), da State STATE_DATETIMESTART per on(id) überwacht wird.
            if (LOGINFO) log('Timer ' + TIMERS[i].name + ': Startdatum im State ist leer, daher werden Startdatum und Initialwerte frisch gesetzt.');
        }

        /***************************
         * Überwache State-Button reStartCounter
         **************************/
        on({id:FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_RESTART, val:true}, function (obj) {
            // First_ need to get - within on...id - current state portion
            let tmpArray = obj.id.split('.');
            let statePortion = tmpArray[(tmpArray.length - 2)]

            setState(FINAL_STATE_PATH + statePortion + '.' + STATE_DATETIMESTART, Date.now()); // Dies triggert automatisch updateStates(), da State STATE_DATETIMESTART per on(id) überwacht wird.
            setStateDelayed(FINAL_STATE_PATH + statePortion + '.' + STATE_RESTART, false, 300); // wieder zurück setzen zur schönen Darstellung.
        });

        /***************************
         * Überwache State-Button interval, da diese Anzahl Tage vom User jederzeit geändert werden können
         **************************/
        on({id: FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_INTERVAL, change:'ne'}, function (obj) {
            updateStates(TIMERS[i]);
        });

        /***************************
         * Überwache Datum/Uhrzeit Counter-Start, falls dieser manuell geändert wurde.
         **************************/
        on({id: FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_DATETIMESTART, change:'ne'}, function (obj) {
            updateStates(TIMERS[i]);
        });

        /***************************
         * Sobald die Planzen gegossen werden müssen, führen wir folgendes aus.
         * @param {object} objTimes  Objekt, also Array-Element von TIMERS
         **************************/
        function updateStates(objTimes) {
            let now = new Date();
            let nowTimeStamp = now.getTime();

            let startTimeInState = new Date(getState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_DATETIMESTART).val);
            let intervalInState = getState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_INTERVAL).val;
            let dateTimeDue = dateAddMinutes(startTimeInState, intervalInState*60*24);

            let numberOfMsDue = nowTimeStamp - dateTimeDue;  // https://stackoverflow.com/questions/7709803/javascript-get-minutes-between-two-dates
            let numberOfMinutesDue = Math.floor((numberOfMsDue/1000)/60);
            let numberOfDaysDue = Math.round((numberOfMinutesDue/60)/24);

            let numberOfMsLeft      = dateTimeDue - nowTimeStamp;
            let numberOfMinutesLeft = Math.floor((numberOfMsLeft/1000)/60);
            let numberOfDaysLeft = Math.round((numberOfMinutesLeft/60)/24);

            let numberOfMsElapsed = nowTimeStamp - startTimeInState.getTime();
            let numberOfMinutesElapsed = Math.floor((numberOfMsElapsed/1000)/60);
            let numberOfDaysElapsed = Math.round((numberOfMinutesElapsed/60)/24);

            setState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_DAYS_OVERDUE, numberOfDaysDue);
            setState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_DAYS_LEFT, numberOfDaysLeft);
            setState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_DAYS_ELAPSED, numberOfDaysElapsed);

            if ( dateTimeDue < nowTimeStamp ) {
                // Jetzt die Pflanzen gießen
                setState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_OVERDUE, true);
                if (LOGINFO) log('Timer ' + objTimes.name + ': Prüfungsergebnis: Fällig seit ' + numberOfDaysDue + ' Tagen');
            } else {
                // Pflanzen noch nicht gießen
                setState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_OVERDUE, false);
                if (LOGINFO) log('Timer ' + objTimes.name + ': Prüfungsergebnis: Noch nicht fällig, erst in ' + numberOfDaysLeft + ' Tagen');
            }        
            // Setze Prozent
            let percent = Math.round(numberOfDaysElapsed * 100 / intervalInState);
            if (percent > 100) percent = 100;
            setState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_PERCENT_ELAPSED, percent);

            // Setze Level (Farben) je nach %
            let levelResult = 'undefined';
            if ( isInRange(percent, LEVEL_GREEN[0], LEVEL_GREEN[1]) ) levelResult = 'green';
            if ( isInRange(percent, LEVEL_YELLOW[0], LEVEL_YELLOW[1]) ) levelResult = 'yellow';
            if ( isInRange(percent, LEVEL_RED[0], LEVEL_RED[1]) ) levelResult = 'red';
            setState(FINAL_STATE_PATH + objTimes.state + '.' + STATE_LEVEL, levelResult);

        }

    } // for

}

/*******************************************************************************
 * Weitere unterstützende Funktionen usw.
 *******************************************************************************/


/**
 * Add certain number of minutes to a given date/time.
 * @param {object}    date      Provided date.
 * @param {number}    minutes   number of minutes to be added to a given date
 * @return {object}   new date with the minutes added
 */
function dateAddMinutes(date, minutes) {
    return new Date(date.getTime() + minutes*60000);
}

/**
 * Prüft ob Variableninhalt eine Zahl ist.
 * isNumber ('123'); // true  
 * isNumber ('123abc'); // false  
 * isNumber (5); // true  
 * isNumber ('q345'); // false
 * isNumber(null); // false
 * isNumber(undefined); // false
 * isNumber(false); // false
 * isNumber('   '); // false
 * @source https://stackoverflow.com/questions/1303646/check-whether-variable-is-number-or-string-in-javascript
 * @param {any} n     Variable, die zu prüfen ist auf Zahl
 * @return {boolean}  true falls Zahl, false falls nicht.
  */
function isNumber(n) { 
    return /^-?[\d.]+(?:e-?\d+)?$/.test(n); 
}

/**
 * Checks if a number is within a range. Returns true if in range, and false otherwise.
 * @param x {number}  Number to check if it is within range
 * @param min {number}   min value
 * @param max {number}  max value
 * @return {boolean} true if in range, and false otherwise.
 */
function isInRange(x, min, max) {
    return ((x-min)*(x-max) <= 0);
}


/**
 * Build states
 */
function buildScriptStates() {

    let finalStates = [];
    for (let i = 0; i < TIMERS.length; i++) {

        if (isLikeEmpty(TIMERS[i].state)) {
            continue; // breaks current iteration in the loop and continues with the next
        }
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_INTERVAL, {'name':'Set interval in days', 'type':'number', 'unit':'d', 'min':1, 'max':60, 'read':true, 'write':true, 'role':'value', 'def':INTERVAL_PRESET}]);
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_RESTART, {'name':'Restart counter', 'type':'boolean', 'read':true, 'write':true, 'role':'button', 'def':false}]);
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_OVERDUE, {'name':'Overdue?', 'type':'boolean', 'read':true, 'write':false, 'role':'state'}]);
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_DAYS_OVERDUE, {'name':'Number of days overdue', 'type':'number', 'unit':'d', 'min':0, 'max':9999, 'read':true, 'write':false, 'role':'value', 'def':0}]);
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_PERCENT_ELAPSED, {'name':'Elapsed in %', 'type':'number', 'unit':'%', 'min':0, 'max':100, 'read':true, 'write':false, 'role':'value', 'def':0}]);
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_DAYS_ELAPSED, {'name':'Elapsed in number of days', 'type':'number', 'unit':'d', 'min':0, 'max':9999, 'read':true, 'write':false, 'role':'value', 'def':0}]);
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_DAYS_LEFT, {'name':'Days left', 'type':'number', 'unit':'d', 'min':0, 'max':9999, 'read':true, 'write':false, 'role':'value', 'def':0}]);
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_DATETIMESTART, {'name':'Date/Time of counter start', 'type':'number', 'read':true, 'write':true, 'role':'value.time' }]);
        finalStates.push([FINAL_STATE_PATH + TIMERS[i].state + '.' + STATE_LEVEL, {'name':'green/yellow/red per elapsed %', 'type':'string', 'read':true, 'write':false, 'role':'value'}]);

    }

    return finalStates;

}

/**
 * Checks if Array or String is not undefined, null or empty.
 * 08-Sep-2019: added check for [ and ] to also catch arrays with empty strings.
 * @param inputVar - Input Array or String, Number, etc.
 * @return true if it is undefined/null/empty, false if it contains value(s)
 * Array or String containing just whitespaces or >'< or >"< or >[< or >]< is considered empty
 */
function isLikeEmpty(inputVar) {
    if (typeof inputVar !== 'undefined' && inputVar !== null) {
        let strTemp = JSON.stringify(inputVar);
        strTemp = strTemp.replace(/\s+/g, ''); // remove all whitespaces
        strTemp = strTemp.replace(/\"+/g, "");  // remove all >"<
        strTemp = strTemp.replace(/\'+/g, "");  // remove all >'<
        strTemp = strTemp.replace(/\[+/g, "");  // remove all >[<
        strTemp = strTemp.replace(/\]+/g, "");  // remove all >]<
        if (strTemp !== '') {
            return false;
        } else {
            return true;
        }
    } else {
        return true;
    }
}

/**
 * For a given state path, we extract the location '0_userdata.0' or 'javascript.0' or add '0_userdata.0', if missing.
 * @param {string}  path            Like: 'Computer.Control-PC', 'javascript.0.Computer.Control-PC', '0_userdata.0.Computer.Control-PC'
 * @param {boolean} returnFullPath  If true: full path like '0_userdata.0.Computer.Control-PC', if false: just location like '0_userdata.0' or 'javascript.0'
 * @return {string}                 Path
 */
function validateStatePath(path, returnFullPath) {
    if (path.startsWith('.')) path = path.substr(1);    // Remove first dot
    if (path.endsWith('.'))   path = path.slice(0, -1); // Remove trailing dot
    if (path.length < 1) log('Provided state path is not valid / too short.', 'error')
    let match = path.match(/^((javascript\.([1-9][0-9]|[0-9])\.)|0_userdata\.0\.)/);
    let location = (match == null) ? '0_userdata.0' : match[0].slice(0, -1); // default is '0_userdata.0'.
    if(returnFullPath) {
        return (path.indexOf(location) == 0) ? path : (location + '.' + path);
    } else {
        return location;
    }
}


/**
 * Create states under 0_userdata.0 or javascript.x
 * Current Version:     https://github.com/Mic-M/iobroker.createUserStates
 * Support:             https://forum.iobroker.net/topic/26839/
 * Autor:               Mic (ioBroker) | Mic-M (github)
 * Version:             1.1 (26 January 2020)
 * Example:             see https://github.com/Mic-M/iobroker.createUserStates#beispiel
 * -----------------------------------------------
 * PLEASE NOTE: Per https://github.com/ioBroker/ioBroker.javascript/issues/474, the used function setObject() 
 *              executes the callback PRIOR to completing the state creation. Therefore, we use a setTimeout and counter. 
 * -----------------------------------------------
 * @param {string} where          Where to create the state: '0_userdata.0' or 'javascript.x'.
 * @param {boolean} force         Force state creation (overwrite), if state is existing.
 * @param {array} statesToCreate  State(s) to create. single array or array of arrays
 * @param {object} [callback]     Optional: a callback function -- This provided function will be executed after all states are created.
 */
function createUserStates(where, force, statesToCreate, callback = undefined) {
 
    const WARN = false; // Only for 0_userdata.0: Throws warning in log, if state is already existing and force=false. Default is false, so no warning in log, if state exists.
    const LOG_DEBUG = false; // To debug this function, set to true
    // Per issue #474 (https://github.com/ioBroker/ioBroker.javascript/issues/474), the used function setObject() executes the callback 
    // before the state is actual created. Therefore, we use a setTimeout and counter as a workaround.
    const DELAY = 50; // Delay in milliseconds (ms). Increase this to 100, if it is not working.

    // Validate "where"
    if (where.endsWith('.')) where = where.slice(0, -1); // Remove trailing dot
    if ( (where.match(/^((javascript\.([1-9][0-9]|[0-9]))$|0_userdata\.0$)/) == null) ) {
        log('This script does not support to create states under [' + where + ']', 'error');
        return;
    }

    // Prepare "statesToCreate" since we also allow a single state to create
    if(!Array.isArray(statesToCreate[0])) statesToCreate = [statesToCreate]; // wrap into array, if just one array and not inside an array

    // Add "where" to STATES_TO_CREATE
    for (let i = 0; i < statesToCreate.length; i++) {
        let lpPath = statesToCreate[i][0].replace(/\.*\./g, '.'); // replace all multiple dots like '..', '...' with a single '.'
        lpPath = lpPath.replace(/^((javascript\.([1-9][0-9]|[0-9])\.)|0_userdata\.0\.)/,'') // remove any javascript.x. / 0_userdata.0. from beginning
        lpPath = where + '.' + lpPath; // add where to beginning of string
        statesToCreate[i][0] = lpPath;
    }

    if (where != '0_userdata.0') {
        // Create States under javascript.x
        let numStates = statesToCreate.length;
        statesToCreate.forEach(function(loopParam) {
            if (LOG_DEBUG) log('[Debug] Now we are creating new state [' + loopParam[0] + ']');
            let loopInit = (loopParam[1]['def'] == undefined) ? null : loopParam[1]['def']; // mimic same behavior as createState if no init value is provided
            createState(loopParam[0], loopInit, force, loopParam[1], function() {
                numStates--;
                if (numStates === 0) {
                    if (LOG_DEBUG) log('[Debug] All states processed.');
                    if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                        if (LOG_DEBUG) log('[Debug] Function to callback parameter was provided');
                        return callback();
                    } else {
                        return;
                    }
                }
            });
        });
    } else {
        // Create States under 0_userdata.0
        let numStates = statesToCreate.length;
        let counter = -1;
        statesToCreate.forEach(function(loopParam) {
            counter += 1;
            if (LOG_DEBUG) log ('[Debug] Currently processing following state: [' + loopParam[0] + ']');
            if( ($(loopParam[0]).length > 0) && (existsState(loopParam[0])) ) { // Workaround due to https://github.com/ioBroker/ioBroker.javascript/issues/478
                // State is existing.
                if (WARN && !force) log('State [' + loopParam[0] + '] is already existing and will no longer be created.', 'warn');
                if (!WARN && LOG_DEBUG) log('[Debug] State [' + loopParam[0] + '] is already existing. Option force (=overwrite) is set to [' + force + '].');
                if(!force) {
                    // State exists and shall not be overwritten since force=false
                    // So, we do not proceed.
                    numStates--;
                    if (numStates === 0) {
                        if (LOG_DEBUG) log('[Debug] All states successfully processed!');
                        if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                            if (LOG_DEBUG) log('[Debug] An optional callback function was provided, which we are going to execute now.');
                            return callback();
                        }
                    } else {
                        // We need to go out and continue with next element in loop.
                        return; // https://stackoverflow.com/questions/18452920/continue-in-cursor-foreach
                    }
                } // if(!force)
            }

            // State is not existing or force = true, so we are continuing to create the state through setObject().
            let obj = {};
            obj.type = 'state';
            obj.native = {};
            obj.common = loopParam[1];
            setObject(loopParam[0], obj, function (err) {
                if (err) {
                    log('Cannot write object for state [' + loopParam[0] + ']: ' + err);
                } else {
                    if (LOG_DEBUG) log('[Debug] Now we are creating new state [' + loopParam[0] + ']')
                    let init = null;
                    if(loopParam[1].def === undefined) {
                        if(loopParam[1].type === 'number') init = 0;
                        if(loopParam[1].type === 'boolean') init = false;
                        if(loopParam[1].type === 'string') init = '';
                    } else {
                        init = loopParam[1].def;
                    }
                    setTimeout(function() {
                        setState(loopParam[0], init, true, function() {
                            if (LOG_DEBUG) log('[Debug] setState durchgeführt: ' + loopParam[0]);
                            numStates--;
                            if (numStates === 0) {
                                if (LOG_DEBUG) log('[Debug] All states processed.');
                                if (typeof callback === 'function') { // execute if a function was provided to parameter callback
                                    if (LOG_DEBUG) log('[Debug] Function to callback parameter was provided');
                                    return callback();
                                }
                            }
                        });
                    }, DELAY + (20 * counter) );
                }
            });
        });
    }
}


