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