"use strict";

const SQL_WASM_PATH = "js/sql-wasm.wasm";

const SQL_FROM_REGEX = /FROM\s+((?=['"])((["'])(?<g1>[^'"]+))|(?<g2>\w+))/mi;
const SQL_LIMIT_REGEX = /LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/mi;
const SQL_SELECT_REGEX = /SELECT\s+[^;]+\s+FROM\s+/mi;

function quoteIdentifier(name) {
    return '"' + name.replace(/"/g, '""') + '"';
}

let dbLoaded = false;
let worker = null;
let nextMessageId = 0;
const pendingMessages = new Map();

function initWorker() {
    worker = new Worker("js/worker.sql-wasm.js");
    worker.onmessage = function (event) {
        const data = event.data;
        const id = data.id;

        if (pendingMessages.has(id)) {
            const { resolve, reject } = pendingMessages.get(id);
            pendingMessages.delete(id);

            if (data.error) {
                reject(new Error(data.error));
            } else {
                resolve(data);
            }
        }
    };
    worker.onerror = function (err) {
        console.error("Worker error:", err);
    };
}

function sendWorkerMessage(action, payload = {}, transferables = []) {
    return new Promise((resolve, reject) => {
        const id = nextMessageId++;
        pendingMessages.set(id, { resolve, reject });
        worker.postMessage({ id, action, ...payload }, transferables);
    });
}

let lastCachedQueryCount = { select: "", count: 0 };
let loadedTableNames = [];
let editor = null;
const errorBox = $("#error");
const infoBox = $("#info");
const hashParams = new URLSearchParams(window.location.hash.substring(1));

function updateHashSql(query) {
    hashParams.set("sql", query);
    history.replaceState(null, null, `#${hashParams.toString()}`);
}

function updateHashUrl(urlStr) {
    hashParams.set("url", urlStr);
    history.replaceState(null, null, `#${hashParams.toString()}`);
}

function clearHashUrl() {
    if (hashParams.has("url")) {
        hashParams.delete("url");
        history.replaceState(null, null, `#${hashParams.toString()}`);
    }
}

const selectFormatter = function (item) {
    const index = item.text.indexOf("(");
    if (index > -1) {
        const name = item.text.substring(0, index);
        const tableName = item.text.substring(index - 1);
        const span = $("<span>");
        span.append(document.createTextNode(name));
        span.append($("<span>").css("color", "#ccc").text(tableName));
        return span;
    } else {
        return item.text;
    }
};

initialize();

function initialize() {
    let toggleFullScreen = function () {
        const container = $("#main-container");
        const resizerExpandIcon = $("#resizer-expand");
        const resizerCollapseIcon = $("#resizer-collapse");

        container.toggleClass("container container-fluid");
        resizerExpandIcon.toggle();
        resizerCollapseIcon.toggle();
    };
    $("#resizer").click(toggleFullScreen);
    $("#sql-editor").keydown(onKeyDown);

    if (typeof FileReader === "undefined" || typeof WebAssembly === "undefined") {
        $("#dropzone, #dropzone-dialog").hide();
        $("#compat-error").toggleClass("d-none", false);
    } else {
        initWorker();
        setupDragAndDrop();
    }

    //Initialize editor
    const editorElement = document.getElementById("sql-editor");
    editorElement.classList.add("language-sql");
    editor = CodeJar(editorElement, (el) => {
        Prism.highlightElement(el);
    });

    $(".no-propagate").on("click", function (el) {
        el.stopPropagation();
    });

    const loadUrlDB = hashParams.get("url");
    if (loadUrlDB != null) {
        loadRemoteDB(loadUrlDB);
    } else if (window.APP_CONFIG && window.APP_CONFIG.defaultUrl) {
        loadRemoteDB(window.APP_CONFIG.defaultUrl);
    }
}

async function loadRemoteDB(urlStr) {
    updateHashUrl(urlStr);
    try {
        const resolvedUrl = new URL(decodeURIComponent(urlStr), window.location.href);
        setIsLoading(true);
        const response = await fetch(resolvedUrl.href);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const pathname = resolvedUrl.pathname.toLowerCase();
        if (pathname.endsWith(".zip")) {
            await handleZipFile(buffer);
        } else {
            await loadDB(buffer);
        }
    } catch (err) {
        setIsLoading(false);
        window.alert("Error loading remote database: " + err.message);
    }
}

async function loadDB(arrayBuffer) {
    setIsLoading(true);

    resetTableList();

    try {
        // Send ArrayBuffer to Worker using transferable array for 0-copy transfer
        await sendWorkerMessage("open", { buffer: arrayBuffer }, [arrayBuffer]);
        dbLoaded = true;

        const firstTableName = await populateTableList(true);
        const sqlParam = hashParams.get("sql");
        const defaultSql = (window.APP_CONFIG && window.APP_CONFIG.defaultSql) ? window.APP_CONFIG.defaultSql : null;

        if (sqlParam != null) {
            editor.updateCode(sqlParam);
            await renderQuery(sqlParam);
        } else if (defaultSql != null) {
            editor.updateCode(defaultSql);
            await renderQuery(defaultSql);
        } else if (firstTableName !== null) {
            await doDefaultSelect(firstTableName);
        }

        $("#output-box").show();
        setTimeout(() => {
            $("#output-box").css("opacity", 1);
        }, 50);
        $(".nouploadinfo").hide();
        $("#sample-db-link").hide();
        $("#dropzone").css("height", "75px");

    } catch (ex) {
        setIsLoading(false);
        window.alert(ex.message || ex);
    } finally {
        setIsLoading(false);
    }
}

async function populateTableList(selectFirst = false) {
    const tableList = $("#tables");
    const currentSelected = tableList.val();

    // Reset table name cache
    loadedTableNames = [];
    tableList.empty();
    tableList.append("<option></option>");

    try {
        const masterResults = await sendWorkerMessage("exec", {
            sql: "SELECT name, type FROM sqlite_master WHERE type='table' OR type='view' ORDER BY name"
        });

        let firstTableName = null;

        if (masterResults.results && masterResults.results.length > 0) {
            const rows = masterResults.results[0].values;
            for (let i = 0; i < rows.length; i++) {
                const name = rows[i][0];
                const type = rows[i][1];

                if (firstTableName === null) {
                    firstTableName = name;
                }

                const rowCount = await getTableRowsCount(name);
                loadedTableNames.push(name);
                const tableType = type !== "table" ? `, ${type}` : "";
                const option = $("<option>").val(name).text(`${name} (${rowCount} rows${tableType})`);
                tableList.append(option);
            }
        }

        if (selectFirst && firstTableName !== null) {
            tableList.val(firstTableName).trigger("change.select2");
            return firstTableName;
        } else if (currentSelected && loadedTableNames.includes(currentSelected)) {
            tableList.val(currentSelected).trigger("change.select2");
            return currentSelected;
        } else {
            tableList.val(null).trigger("change.select2");
            return null;
        }
    } catch (e) {
        console.error("Error populating table list:", e);
        return null;
    }
}

async function getTableRowsCount(name) {
    try {
        const results = await sendWorkerMessage("exec", {
            sql: `SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`
        });
        if (results.results && results.results.length > 0) {
            return results.results[0].values[0][0];
        }
        return -1;
    } catch (e) {
        console.error(e);
        return -1;
    }
}

async function getQueryRowCount(query) {
    if (query === lastCachedQueryCount.select) {
        return lastCachedQueryCount.count;
    }

    let queryReplaced = query.replace(SQL_SELECT_REGEX, "SELECT COUNT(*) AS count FROM ");

    if (queryReplaced !== query) {
        queryReplaced = queryReplaced.replace(SQL_LIMIT_REGEX, "");
        try {
            const results = await sendWorkerMessage("exec", { sql: queryReplaced });
            if (results.results && results.results.length > 0) {
                const count = results.results[0].values[0][0];
                lastCachedQueryCount.select = query;
                lastCachedQueryCount.count = count;
                return count;
            }
            return -1;
        } catch (e) {
            console.error(e);
            return -1;
        }
    } else {
        return -1;
    }
}

async function getTableColumnTypes(tableName) {
    let result = new Map();
    try {
        const results = await sendWorkerMessage("exec", {
            sql: `PRAGMA table_info(${quoteIdentifier(tableName)})`
        });
        if (results.results && results.results.length > 0) {
            const rows = results.results[0].values;
            // PRAGMA table_info returns columns: cid, name, type, notnull, dflt_value, pk
            for (let i = 0; i < rows.length; i++) {
                const name = rows[i][1];
                let type = rows[i][2];
                const notnull = rows[i][3];
                const pk = rows[i][5];

                if (notnull === 1) {
                    type += " NOT NULL";
                }
                if (pk === 1) {
                    type += " PRIMARY KEY";
                }
                result.set(name, type);
            }
        }
    } catch (e) {
        console.error(e);
    }
    return result;
}

function resetTableList() {
    const tables = $("#tables");
    loadedTableNames = [];
    tables.empty();
    tables.append("<option></option>");
    tables.select2({
        placeholder: "Select a table",
        theme: "bootstrap-5",
        templateSelection: selectFormatter,
        templateResult: selectFormatter
    });
    tables.on("change", async function (e) {
        await doDefaultSelect(tables.val());
    });
}

function setIsLoading(isLoading) {
    const dropText = $("#drop-text");
    const loading = $("#drop-loading");
    if (isLoading) {
        dropText.hide();
        loading.toggleClass("d-none", false);
    } else {
        dropText.show();
        loading.toggleClass("d-none", true);
    }
}

function dropzoneClick() {
    $("#dropzone-dialog").click();
}

function setupDragAndDrop() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("dropzone-dialog");

    // Prevent default drag behaviors for window to avoid opening files dropped outside the dropzone
    window.addEventListener("dragover", function (e) {
        e.preventDefault();
    }, false);
    window.addEventListener("drop", function (e) {
        e.preventDefault();
    }, false);

    // Drag-and-drop event handlers for the dropzone area
    dropzone.addEventListener("dragenter", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("drag");
    }, false);

    dropzone.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("drag");
    }, false);

    dropzone.addEventListener("dragleave", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("drag");
    }, false);

    dropzone.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("drag");

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    }, false);

    // Click file selector handling
    fileInput.addEventListener("change", function (e) {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    }, false);
}

function handleFile(file) {
    clearHashUrl();
    if (file.name.endsWith(".zip")) {
        handleZipFile(file);
    } else {
        setIsLoading(true);
        const reader = new FileReader();
        reader.onload = function (e) {
            loadDB(e.target.result);
        };
        reader.onerror = function () {
            setIsLoading(false);
            window.alert("Error reading file.");
        };
        reader.readAsArrayBuffer(file);
    }
}

async function handleZipFile(file) {
    setIsLoading(true);
    try {
        const zip = await JSZip.loadAsync(file);

        let dbFile = null;
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && (
                relativePath.endsWith(".sqlite") ||
                relativePath.endsWith(".db") ||
                relativePath.endsWith(".db3") ||
                relativePath.endsWith(".sqlite3")
            )) {
                dbFile = zipEntry;
            }
        });

        if (!dbFile) {
            throw new Error("No SQLite database (.sqlite, .db, .db3, .sqlite3) found inside the ZIP file.");
        }

        const arrayBuffer = await dbFile.async("arraybuffer");
        await loadDB(arrayBuffer);

    } catch (err) {
        setIsLoading(false);
        window.alert(err.message || err);
    }
}

async function doDefaultSelect(name) {
    const defaultSelect = `SELECT * FROM ${quoteIdentifier(name)} LIMIT 0,30`;
    editor.updateCode(defaultSelect);
    await renderQuery(defaultSelect);
}

async function executeSql() {
    const query = editor.toString();
    await renderQuery(query);

    // If query creates, drops, alters, or modifies data, refresh the dropdown to keep counts/names in sync
    const SCHEMA_MODIFY_REGEX = /\b(create|drop|alter|insert|delete|update|replace)\b/i;
    if (SCHEMA_MODIFY_REGEX.test(query)) {
        lastCachedQueryCount = { select: "", count: 0 };
        await populateTableList();
    } else {
        $("#tables").val(getTableNameFromQuery(query)).trigger("change.select2");
    }

    updateHashSql(query);
}

function getTableNameFromQuery(query) {
    const sqlRegex = SQL_FROM_REGEX.exec(query);
    if (sqlRegex != null) {
        return sqlRegex.groups.g1 ?? sqlRegex.groups.g2;
    } else {
        return null;
    }
}

async function parseLimitFromQuery(query) {
    const sqlRegex = SQL_LIMIT_REGEX.exec(query);
    if (sqlRegex != null) {
        let result = { max: 0, offset: 0 };

        if (sqlRegex.length > 2 && typeof sqlRegex[2] !== "undefined") {
            result.offset = parseInt(sqlRegex[1]);
            result.max = parseInt(sqlRegex[2]);
        } else {
            result.offset = 0;
            result.max = parseInt(sqlRegex[1]);
        }

        if (result.max === 0) {
            result.pages = 0;
            result.currentPage = 0;
            return result;
        }

        const queryRowsCount = await getQueryRowCount(query);
        if (queryRowsCount !== -1) {
            result.pages = Math.ceil(queryRowsCount / result.max);
        }
        result.currentPage = Math.floor(result.offset / result.max) + 1;
        result.rowCount = queryRowsCount;

        return result;
    } else {
        return null;
    }
}

async function setPage(el, next) {
    if ($(el).hasClass("disabled")) return;

    const query = editor.toString();
    const limit = await parseLimitFromQuery(query);

    let pageToSet = 0;
    if (typeof next !== "undefined") {
        pageToSet = (next ? limit.currentPage : limit.currentPage - 2);
    } else {
        const page = window.prompt("Go to page");
        if (!isNaN(page) && page >= 1 && page <= limit.pages) {
            pageToSet = page - 1;
        } else {
            return;
        }
    }

    const offset = (pageToSet * limit.max);
    editor.updateCode(query.replace(SQL_LIMIT_REGEX, `LIMIT ${offset},${limit.max}`));

    await executeSql();
}

async function refreshPagination(query) {
    const limit = await parseLimitFromQuery(query);
    if (limit !== null && limit.pages > 0) {
        const pager = $("#pager");
        const pagePrev = $("#page-prev");
        const pageNext = $("#page-next");

        pager.attr("title", `Row count: ${limit.rowCount}`);
        bootstrap.Tooltip.getOrCreateInstance("#pager").hide();
        pager.text(limit.currentPage + " / " + limit.pages);

        if (limit.currentPage <= 1) {
            pagePrev.addClass("disabled");
        } else {
            pagePrev.removeClass("disabled");
        }

        if ((limit.currentPage + 1) > limit.pages) {
            pageNext.addClass("disabled");
        } else {
            pageNext.removeClass("disabled");
        }

        setPagerVisible(true);
    } else {
        setPagerVisible(false);
    }
}

function showError(msg) {
    $("#data").hide();
    setPagerVisible(false);
    errorBox.show();
    errorBox.text(msg);
}

function setPagerVisible(visible) {
    $("#bottom-bar").toggleClass("d-none", !visible);
    if (visible) {
        $("#footer").attr("style", "margin-top: -0.75rem !important");
    } else {
        $("#footer").css("margin-top", "");
    }
}

function htmlEncode(value) {
    return $("<div/>").text(value).html();
}

async function renderQuery(query) {
    const dataBox = $("#data");
    const thead = dataBox.find("thead").find("tr");
    const tbody = dataBox.find("tbody");

    thead.empty();
    tbody.empty();
    errorBox.hide();
    infoBox.hide();
    dataBox.show();

    let columnTypes = new Map();
    const tableName = getTableNameFromQuery(query);
    if (tableName != null) {
        columnTypes = await getTableColumnTypes(tableName);
    }

    let results;
    try {
        results = await sendWorkerMessage("exec", { sql: query });
    } catch (ex) {
        showError(ex.message || ex);
        return;
    }

    let isEmptyTable = true;

    if (results.results && results.results.length > 0) {
        isEmptyTable = false;
        const res = results.results[0];
        const columnNames = res.columns;
        const values = res.values;

        for (let i = 0; i < columnNames.length; i++) {
            const columnName = columnNames[i];
            const type = columnTypes.has(columnName) ? columnTypes.get(columnName) : "";
            thead.append(`<th><span data-bs-toggle="tooltip" title="${type}">${columnName}</span></th>`);
        }

        for (let r = 0; r < values.length; r++) {
            const tr = $('<tr>');
            const rowValues = values[r];
            for (let i = 0; i < rowValues.length; i++) {
                const columnName = columnNames[i];
                const type = columnTypes.has(columnName) ? columnTypes.get(columnName).toLowerCase() : "";
                if (type === "blob" || type === "blob sub_type binary") {
                    if (rowValues[i] === null) {
                        tr.append(`<td><span title="Blob">null</span></td>`);
                    } else {
                        renderBlobItem(tr, rowValues[i]);
                    }
                } else {
                    let value = htmlEncode(rowValues[i]);
                    tr.append(`<td><span title="${value}">${value}</span></td>`);
                }
            }
            tbody.append(tr);
        }
    }

    if (isEmptyTable) {
        infoBox.text("No data returned for the given query.");
        infoBox.show();
    }

    await refreshPagination(query);

    document.querySelectorAll('[data-bs-toggle="tooltip"]')
        .forEach(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
}

function renderBlobItem(tr, bytes) {
    const td = document.createElement("td");
    const span = document.createElement("span");
    span.title = "Blob";
    const downloadLink = document.createElement("a");
    downloadLink.href = "javascript:void(0)";
    downloadLink.innerText = `Download (${formatBytes(bytes.length)})`;
    downloadLink.onclick = function () {
        saveAs(new Blob([bytes]), "blob");
    };
    span.append(downloadLink);
    td.append(span);
    tr.append(td);
}

function formatBytes(bytes,decimals) {
    if(bytes === 0) return '0 Bytes';
    const k = 1024,
        dm = decimals || 2,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        executeSql();
    }
}

function arrayToCsv(data) {
    return data.map(row =>
        row.map(String)  // convert every value to String
            .map(v => v.replaceAll('"', '""'))  // escape double quotes
            .map(v => `"${v}"`)  // quote it
            .join(',')  // comma-separated
    ).join('\r\n');  // rows starting on new lines
}

async function exportCsvTableQuery(query) {
    let exportedRows = [];
    try {
        const results = await sendWorkerMessage("exec", { sql: query });
        if (results.results && results.results.length > 0) {
            const res = results.results[0];
            exportedRows.push(res.columns);
            exportedRows.push(...res.values);
        }
        return exportedRows;
    } catch (ex) {
        showError(ex.message || ex);
        setIsLoading(false);
        return null;
    }
}

async function exportCsvTable(tableName) {
    return await exportCsvTableQuery(`SELECT * FROM ${quoteIdentifier(tableName)}`);
}

async function exportAllToCsv() {
    setIsLoading(true);
    const zip = new JSZip();
    try {
        for (const tableName of loadedTableNames) {
            const exportedRows = await exportCsvTable(tableName);
            if (exportedRows != null) {
                zip.file(tableName + ".csv", arrayToCsv(exportedRows));
            } else {
                setIsLoading(false);
                return;
            }
        }

        const content = await zip.generateAsync({type: "blob"});
        saveAs(content, "exported_all_db.zip");
    } catch (e) {
        showError(e);
    }
    setIsLoading(false);
}

async function exportSelectedTableToCsv() {
    const tableName = $("#tables").val();
    setIsLoading(true);

    const exportedRows = await exportCsvTable(tableName);
    if (exportedRows != null) {
        const blob = new Blob([arrayToCsv(exportedRows)], {type: "text/plain;charset=utf-8"});
        saveAs(blob, "exported_" + tableName.toLowerCase() + "_db.csv");
    }

    setIsLoading(false);
}

async function exportQueryTableToCsv() {
    setIsLoading(true);

    const query = editor.toString();
    const exportedRows = await exportCsvTableQuery(query);
    if (exportedRows != null) {
        const blob = new Blob([arrayToCsv(exportedRows)], {type: "text/plain;charset=utf-8"});
        saveAs(blob, "exported_" + getTableNameFromQuery(query).toLowerCase() + "_db.csv");
    }

    setIsLoading(false);
}
