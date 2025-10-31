import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import { default as express } from 'express';
import { default as sqlite3 } from 'sqlite3';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const port = 8080;
const root = path.join(__dirname, 'public');
const template = path.join(__dirname, 'templates');

let app = express();
app.use(express.static(root));
app.use('/chartjs', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));

const db = new sqlite3.Database('./nyc.db', sqlite3.OPEN_READONLY, (err) => {
    if (err){
        console.log("Error connecting to DB");
    }
    else {
        console.log("Success, connected to DB");
    }
});


app.get('/temp/record/:recordMaxTemp', (req, res) => {
  const recordMaxTemp = req.params.recordMaxTemp;
  let html_data = null;
  let day_rows = null;
  let all_record_temps = null;
  let errorSent = false;

    const sendResponse = function () {
        if (errorSent) return;
        if (!html_data || !day_rows || !all_record_temps) return; // wait until both ready

        if (day_rows.length === 0) {
            res.status(404).type('html').send(`<h1>Error: no data for recorded max temp ${recordMaxTemp}°F</h1>`);
            return;
        }   
        
        const bodyRows = day_rows
            .map((d) => {
                return `
            <tr>
                <td>${d.date}</td>
                <td>${d.actual_mean_temp}</td>
                <td>${d.actual_min_temp} / ${d.actual_max_temp}</td>
                <td>${d.record_max_temp}</td>
            </tr>
        `;
            })
            .join('');

        // Figure out prev/next temps for navigation
    const tempsOnly = all_record_temps.map((r) => r.record_max_temp);
    const idx = tempsOnly.indexOf(Number(recordMaxTemp));

    let prevLink = `<span class="disabled">&larr; none</span>`;
    let nextLink = `<span class="disabled">none &rarr;</span>`;

    if (idx > 0) {
      const prevTemp = tempsOnly[idx - 1];
      prevLink = `<a href="/temp/record/${encodeURIComponent(
        prevTemp
      )}">&larr; ${prevTemp}°F</a>`;
    }
    if (idx >= 0 && idx < tempsOnly.length - 1) {
      const nextTemp = tempsOnly[idx + 1];
      nextLink = `<a href="/temp/record/${encodeURIComponent(
        nextTemp
      )}">${nextTemp}°F &rarr;</a>`;
    }

    const chartLabels = day_rows.map((d) => d.date);
    const chartActual = day_rows.map((d) => d.actual_max_temp);
    const chartRecord = day_rows.map((d) => d.record_max_temp);

    const chartBlock = `
            <canvas
                id="recordTempChart"
                data-labels='${JSON.stringify(chartLabels)}'
                data-actual='${JSON.stringify(chartActual)}'
                data-record='${JSON.stringify(chartRecord)}'>
            </canvas>

            <!-- Chart.js CDN -->
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

            <!-- Simple client-side script to render the chart -->
            <script>
            (function(){
                const canvas = document.getElementById('recordTempChart');
                if (!canvas) return;
                const labels = JSON.parse(canvas.dataset.labels);
                const actual = JSON.parse(canvas.dataset.actual);
                const record = JSON.parse(canvas.dataset.record);

                new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Actual Max Temp (°F)',
                            data: actual,
                            fill: false
                        }, {
                            label: 'Record Max Temp (°F)',
                            data: record,
                            fill: false
                        }]
                    }
                });
            })();
            </script>
        `;

        const html_response = html_data
            .toString()
            .replace('$$$RECORDED_MAX_TEMP$$$', recordMaxTemp)
            .replace('$$$DAY_ROWS$$$', bodyRows)
            .replace("$$$PREV_LINK$$$", prevLink)
            .replace("$$$NEXT_LINK$$$", nextLink)
            .replace("$$$CHART_BLOCK$$$", chartBlock);


        res.status(200).type('html').send(html_response);
    };
    // Load template
    fs.readFile(path.join(template, 'recordedmaxtemps.html'), (err, data) => {
        if (err) {
            console.error('Template read error (/temp/record/:recordMaxTemp):', err);
            res.status(500).type('txt').send('Template read error');
            errorSent = true;
            return;
        }
            html_data = data;
            sendResponse();
    });
    // Query DB
    const sqlDays = `
        SELECT
            date,
            actual_mean_temp,
            actual_min_temp,
            actual_max_temp,
            record_max_temp
        FROM Weather
        WHERE record_max_temp = ?
        ORDER BY date ASC;
    `;

    db.all(sqlDays, [recordMaxTemp], (err, rows) => {
        if (err) {
            console.error('SQL Error (/temp/record rows):', err);
            res.status(500).type('txt').send('SQL Error');
            errorSent = true;
            return;
        }
        day_rows = rows;
        sendResponse();
    });

    // Query 2: list of all distinct record max temps for prev/next
    const sqlRecordTemps = `
        SELECT DISTINCT record_max_temp
        FROM Weather
        ORDER BY record_max_temp DESC;
    `;
    //console.log(`Running SQL for /temp/record/${recordMaxTemp} (record max temp list)...`);

    db.all(sqlRecordTemps, (err, rows) => {
        if (err) {
            console.error("SQL Error (/temp/record/:recordedmaxtemps):", err);
            res.status(500).type("txt").send("SQL Error");
            errorSent = true;
            return;
        }
        console.log(
          `/temp/record/${recordMaxTemp} record max temp-list query returned ${rows.length} temps`
        );
        all_record_temps = rows;
        sendResponse();
    });
});