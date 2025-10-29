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

        console.log(`Rendering date page for ${dateParam}...`);

        if (sql_data.length === 0) {
            res.status(404).type('html').send(`<h1>No data found for ${dateParam}</h1>`);
            return;
        }

        const w = sql_data[0];
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

        const html_response = html_data
            .toString()
            .replace('$$$DATE$$$', dateParam)
            .replace('$$$WEATHER_INFO$$$', weather_info);

        res.status(200).type('html').send(html_response);
    };

    fs.readFile(path.join(template, 'date.html'), (err, data) => {
        if (err) {
            console.error("Template read error:", err);
            res.status(500).type('txt').send('Template read error');
            errorSent = true;
            return;
        }
        console.log("Template loaded");
        html_data = data;
        sendResponse();
    });

    const sql = 'SELECT * FROM Weather WHERE date = ?';
    console.log(`Running query for date: ${dateParam}`);

    db.all(sql, [dateParam], (err, rows) => {
        if (err) {
            console.error("SQL Error:", err);
            res.status(500).type('txt').send('SQL Error');
            errorSent = true;
            return;
        }
        console.log(`SQL query returned ${rows.length} rows`);
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
