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

// Home Page
app.get('/', (req, res) => {
    let html_data = null;
    let sql_data = null;
    let errorSent = false;

    const sendResponse = function() {
        if (errorSent) return;
        if (!html_data || !sql_data) return; // wait for both

        console.log("Rendering homepage with date list...");

        const date_list = sql_data
            .map(row => {
                const encodedDate = encodeURIComponent(row.date);
                return `<li><a href="/date/${encodedDate}">${row.date}</a></li>`;
            })
            .join('');

        const html_response = html_data
            .toString()
            .replace('$$$DATE_LIST$$$', date_list);

        res.status(200).type('html').send(html_response);
    };

    // Load template
    fs.readFile(path.join(template, 'index.html'), (err, data) => {
        if (err) {
            console.error("Template read error:", err);
            res.status(500).type('txt').send('Template read error');
            errorSent = true;
            return;
        }
        console.log("Homepage template loaded");
        html_data = data;
        sendResponse();
    });

    // Query DB
    const sql = 'SELECT DISTINCT date FROM Weather ORDER BY date ASC';
    console.log("Running SQL for homepage...");
    db.all(sql, (err, rows) => {
        if (err) {
            console.error("SQL Error:", err);
            res.status(500).type('txt').send('SQL Error');
            errorSent = true;
            return;
        }
        console.log(`Homepage query returned ${rows.length} rows`);
        sql_data = rows;
        sendResponse();
    });
});


// Date Page
app.get('/date/:date', (req, res) => {
    const dateParam = req.params.date;
    let html_data = null;
    let sql_data = null;
    let errorSent = false;

    const sendResponse = function() {
        if (errorSent) return;
        if (!html_data || !sql_data) return;

        if (sql_data.length === 0) {
            res.status(404).type('html').send(`<h1>No data found for ${dateParam}</h1>`);
            return;
        }

        const w = sql_data[0];

        // Build table content
        const weather_info = `
        <table border="1" cellspacing="0" cellpadding="4">
            <tr><th>Actual Mean Temp</th><td>${w.actual_mean_temp}</td></tr>
            <tr><th>Actual Min Temp</th><td>${w.actual_min_temp}</td></tr>
            <tr><th>Actual Max Temp</th><td>${w.actual_max_temp}</td></tr>
            <tr><th>Average Min Temp</th><td>${w.average_min_temp}</td></tr>
            <tr><th>Average Max Temp</th><td>${w.average_max_temp}</td></tr>
            <tr><th>Record Min Temp</th><td>${w.record_min_temp} (${w.record_min_temp_year})</td></tr>
            <tr><th>Record Max Temp</th><td>${w.record_max_temp} (${w.record_max_temp_year})</td></tr>
            <tr><th>Actual Precipitation</th><td>${w.actual_precipitation}</td></tr>
            <tr><th>Average Precipitation</th><td>${w.average_precipitation}</td></tr>
            <tr><th>Record Precipitation</th><td>${w.record_precipitation}</td></tr>
        </table>`;

        // Compute previous and next dates
        const prevDate = new Date(dateParam);
        prevDate.setDate(prevDate.getDate() - 1);
        const nextDate = new Date(dateParam);
        nextDate.setDate(nextDate.getDate() + 1);
        const formatDate = (d) => d.toISOString().split('T')[0];

        // Data for Chart.js
        const chart_data = {
            date: dateParam,
            prevDate: formatDate(prevDate),
            nextDate: formatDate(nextDate),
            actual_mean_temp: w.actual_mean_temp,
            actual_min_temp: w.actual_min_temp,
            actual_max_temp: w.actual_max_temp,
            average_min_temp: w.average_min_temp,
            average_max_temp: w.average_max_temp
        };

        // Build final HTML
        const html_response = html_data
            .toString()
            .replace('$$$DATE$$$', dateParam)
            .replace('$$$WEATHER_INFO$$$', weather_info)
            .replace('$$$CHART_DATA$$$', JSON.stringify(chart_data));

        res.status(200).type('html').send(html_response);
    };

    // Read HTML template
    fs.readFile(path.join(template, 'date.html'), (err, data) => {
        if (err) {
            console.error('Template read error:', err);
            res.status(500).type('txt').send('Template read error');
            errorSent = true;
            return;
        }
        html_data = data;
        sendResponse();
    });

    // Query weather data
    const sql = 'SELECT * FROM Weather WHERE date = ?';
    db.all(sql, [dateParam], (err, rows) => {
        if (err) {
            console.error('SQL Error:', err);
            res.status(500).type('txt').send('SQL Error');
            errorSent = true;
            return;
        }
        sql_data = rows;
        sendResponse();
    });
});


app.listen(port, () => {
    console.log('Now listening on port ' + port);
});


//Temp Index Page (/temp)
app.get("/temp", (req, res) => {
  let html_data = null;
  let sql_data = null;
  let errorSent = false;

  const sendResponse = function () {
    if (errorSent) return;
    if (!html_data || !sql_data) return; // wait until both ready

    console.log("Rendering /temp page with distinct max temps...");

    // Build table rows: each unique temp links to /temp/<temp>
    const temp_rows = sql_data
      .map((row) => {
        const t = row.actual_max_temp;
        return `
                <tr>
                    <td>${t}°F</td>
                    <td><a href="/temp/${encodeURIComponent(
                      t
                    )}">View dates</a></td>
                </tr>
            `;
      })
      .join("");

    const html_response = html_data
      .toString()
      .replace("$$$TEMP_LIST$$$", temp_rows);

    res.status(200).type("html").send(html_response);
  };

  // Load template
  fs.readFile(path.join(template, "temps.html"), (err, data) => {
    if (err) {
      console.error("Template read error (/temp):", err);
      res.status(500).type("txt").send("Template read error");
      errorSent = true;
      return;
    }
    console.log("/temp template loaded");
    html_data = data;
    sendResponse();
  });

  // Query DB
  const sql = `
        SELECT DISTINCT actual_max_temp
        FROM Weather
        ORDER BY actual_max_temp DESC;
    `;
  console.log("Running SQL for /temp ...");

  db.all(sql, (err, rows) => {
    if (err) {
      console.error("SQL Error (/temp):", err);
      res.status(500).type("txt").send("SQL Error");
      errorSent = true;
      return;
    }
    console.log(`/temp query returned ${rows.length} rows`);
    sql_data = rows;
    sendResponse();
  });
});

// Record Index Page (/temp/record)
app.get("/temp/record", (req, res) => {
  let html_data = null;
  let sql_data = null;
  let errorSent = false;

  const sendResponse = function () {
    if (errorSent) return;
    if (!html_data || !sql_data) return; // wait until both ready

    console.log("Rendering /temp/record page with distinct record max temps...");

    // Build table rows: each unique record temp links to /temp/record/<temp>
    const temp_rows = sql_data
      .map((row) => {
        const t = row.record_max_temp;
        return `
          <tr>
            <td>${t}°F</td>
            <td><a href="/temp/record/${encodeURIComponent(t)}">View dates</a></td>
          </tr>
        `;
      })
      .join("");

    const html_response = html_data.toString().replace("$$$RECORD_TEMP_LIST$$$", temp_rows);

    res.status(200).type("html").send(html_response);
  };

  // Load template file (ensure templates/record.html exists)
  const templatePath = path.join(__dirname, "templates", "record.html");
  fs.readFile(templatePath, (err, data) => {
    if (err) {
      console.error("Template read error (/temp/record):", err);
      if (!errorSent) {
        res.status(500).type("txt").send("Template read error");
        errorSent = true;
      }
      return;
    }
    console.log("/temp/record template loaded");
    html_data = data;
    sendResponse();
  });

  // Query DB: distinct record_max_temp values
  const sql = `
    SELECT DISTINCT record_max_temp
    FROM Weather
    WHERE record_max_temp IS NOT NULL
    ORDER BY record_max_temp DESC;
  `;
  console.log("Running SQL for /temp/record ...");

  db.all(sql, (err, rows) => {
    if (err) {
      console.error("SQL Error (/temp/record):", err);
      if (!errorSent) {
        res.status(500).type("txt").send("SQL Error");
        errorSent = true;
      }
      return;
    }
    console.log(`/temp/record query returned ${rows.length} rows`);
    sql_data = rows;
    sendResponse();
  });
});


//Temp Detail Page (/temp/:temp)
app.get("/temp/:temp", (req, res) => {
  const tempParam = req.params.temp;
  let html_data = null;
  let day_rows = null;
  let all_temps = null;
  let errorSent = false;

  const sendResponse = function () {
    if (errorSent) return;
    if (!html_data || !day_rows || !all_temps) return; // wait for all

    console.log(`Rendering /temp/${tempParam} ...`);

    // If no days matched this temp: send 404
    if (day_rows.length === 0) {
      res
        .status(404)
        .type("html")
        .send(`<h1>Error: no data for temperature ${tempParam}°F</h1>`);
      return;
    }

    // Table body rows for each day that hit this max temp
    const bodyRows = day_rows
      .map((d) => {
        return `
                <tr>
                    <td>${d.date}</td>
                    <td>${d.actual_mean_temp}</td>
                    <td>${d.actual_min_temp} / ${d.actual_max_temp}</td>
                    <td>${d.actual_precipitation}</td>
                </tr>
            `;
      })
      .join("");

    // Figure out prev/next temps for navigation
    const tempsOnly = all_temps.map((r) => r.actual_max_temp);
    const idx = tempsOnly.indexOf(Number(tempParam));

    let prevLink = `<span class="disabled">&larr; none</span>`;
    let nextLink = `<span class="disabled">none &rarr;</span>`;

    if (idx > 0) {
      const prevTemp = tempsOnly[idx - 1];
      prevLink = `<a href="/temp/${encodeURIComponent(
        prevTemp
      )}">&larr; ${prevTemp}°F</a>`;
    }
    if (idx >= 0 && idx < tempsOnly.length - 1) {
      const nextTemp = tempsOnly[idx + 1];
      nextLink = `<a href="/temp/${encodeURIComponent(
        nextTemp
      )}">${nextTemp}°F &rarr;</a>`;
    }

    const chartLabels = day_rows.map((d) => d.date);
    const chartValues = day_rows.map((d) => d.actual_mean_temp);

    const chartBlock = `
            <canvas
                id="tempChart"
                data-labels='${JSON.stringify(chartLabels)}'
                data-values='${JSON.stringify(chartValues)}'>
            </canvas>

            <!-- Chart.js CDN -->
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

            <!-- Simple client-side script to render the chart -->
            <script>
            (function(){
                const canvas = document.getElementById('tempChart');
                if (!canvas) return;
                const labels = JSON.parse(canvas.dataset.labels);
                const values = JSON.parse(canvas.dataset.values);

                new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Actual Mean Temp (°F)',
                            data: values,
                            fill: false
                        }]
                    }
                });
            })();
            </script>
        `;

    // inject everything into the template
    let html_response = html_data.toString();
    html_response = html_response
      .replace("$$$TEMP_VALUE$$$", tempParam)
      .replace("$$$PREV_LINK$$$", prevLink)
      .replace("$$$NEXT_LINK$$$", nextLink)
      .replace("$$$DAY_ROWS$$$", bodyRows)
      .replace("$$$CHART_BLOCK$$$", chartBlock);

    res.status(200).type("html").send(html_response);
  };

  // Load template temp.html
  fs.readFile(path.join(template, "temp.html"), (err, data) => {
    if (err) {
      console.error("Template read error (/temp/:temp):", err);
      res.status(500).type("txt").send("Template read error");
      errorSent = true;
      return;
    }
    console.log("/temp/:temp template loaded");
    html_data = data;
    sendResponse();
  });

  // Query 1: all days that match this actual_max_temp
  const sqlDays = `
        SELECT
            date,
            actual_mean_temp,
            actual_min_temp,
            actual_max_temp,
            actual_precipitation
        FROM Weather
        WHERE actual_max_temp = ?
        ORDER BY date ASC;
    `;
  console.log(`Running SQL for /temp/${tempParam} (day rows)...`);

  db.all(sqlDays, [tempParam], (err, rows) => {
    if (err) {
      console.error("SQL Error (/temp/:temp rows):", err);
      res.status(500).type("txt").send("SQL Error");
      errorSent = true;
      return;
    }
    console.log(
      `/temp/${tempParam} day-rows query returned ${rows.length} rows`
    );
    day_rows = rows;
    sendResponse();
  });

  // Query 2: list of all distinct temps for prev/next
  const sqlTemps = `
        SELECT DISTINCT actual_max_temp
        FROM Weather
        ORDER BY actual_max_temp DESC;
    `;
  console.log(`Running SQL for /temp/${tempParam} (temp list)...`);

  db.all(sqlTemps, (err, rows) => {
    if (err) {
      console.error("SQL Error (/temp/:temp temps):", err);
      res.status(500).type("txt").send("SQL Error");
      errorSent = true;
      return;
    }
    console.log(
      `/temp/${tempParam} temp-list query returned ${rows.length} temps`
    );
    all_temps = rows;
    sendResponse();
  });
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