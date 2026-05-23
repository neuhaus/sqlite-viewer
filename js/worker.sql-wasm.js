"use strict";

// Load the official SQLite3 WASM vanilla JS wrapper
importScripts("sqlite3.js");

let sqlite3 = null;
let db = null;

// Initialize the SQLite3 module asynchronously and queue incoming messages
const sqlite3Promise = sqlite3InitModule().then(loaded => {
    sqlite3 = loaded;
    return loaded;
});

onmessage = function (event) {
    const data = event.data;
    if (!data || !data.action) return;

    sqlite3Promise.then(async () => {
        try {
            switch (data.action) {
                case "open": {
                    if (db) {
                        try {
                            db.close();
                        } catch (e) {
                            console.error("Error closing previous DB:", e);
                        }
                        db = null;
                    }

                    // Create a new in-memory SQLite3 DB
                    db = new sqlite3.oo1.DB();

                    if (data.buffer) {
                        const bytes = new Uint8Array(data.buffer);
                        
                        // Allocate WASM heap space for the database binary
                        const p = sqlite3.capi.sqlite3_malloc(bytes.length);
                        if (p === 0) {
                            throw new Error("Out of memory: Failed to allocate WASM heap space for database.");
                        }

                        // Copy database binary into WASM heap memory
                        sqlite3.wasm.heap8u().set(bytes, p);

                        // Deserialize the heap buffer into the opened database
                        // Flags: 1 (SQLITE_DESERIALIZE_FREEONCLOSE) | 2 (SQLITE_DESERIALIZE_RESIZEABLE)
                        const rc = sqlite3.capi.sqlite3_deserialize(
                            db.pointer,
                            "main",
                            p,
                            bytes.length,
                            bytes.length,
                            1 | 2
                        );

                        if (rc !== 0) {
                            sqlite3.capi.sqlite3_free(p);
                            throw new Error(`Failed to deserialize database (SQLite error code: ${rc})`);
                        }
                    }

                    postMessage({
                        id: data.id,
                        ready: true
                    });
                    break;
                }

                case "exec": {
                    if (!db) {
                        db = new sqlite3.oo1.DB();
                    }
                    if (!data.sql) {
                        throw new Error("exec: Missing query string");
                    }

                    const results = [];
                    const sqlString = data.sql;

                    // Push a new scope on the WASM allocator stack
                    const stack = sqlite3.wasm.scopedAllocPush();
                    try {
                        const isSQLableTypedArray = (v) => v && (v instanceof Uint8Array || v instanceof Int8Array || v instanceof ArrayBuffer);
                        const isTA = isSQLableTypedArray(sqlString);
                        let sqlByteLen = isTA ? sqlString.byteLength : sqlite3.wasm.jstrlen(sqlString);

                        // Allocate memory for statement pointers and SQL tail
                        const ppStmt = sqlite3.wasm.scopedAlloc((2 * sqlite3.wasm.ptr.size) + (sqlByteLen + 1));
                        const pzTail = sqlite3.wasm.ptr.add(ppStmt, sqlite3.wasm.ptr.size);
                        let pSql = sqlite3.wasm.ptr.add(pzTail, sqlite3.wasm.ptr.size);
                        const pSqlEnd = sqlite3.wasm.ptr.add(pSql, sqlByteLen);

                        if (isTA) {
                            sqlite3.wasm.heap8().set(sqlString, pSql);
                        } else {
                            sqlite3.wasm.jstrcpy(sqlString, sqlite3.wasm.heap8(), pSql, sqlByteLen, false);
                        }
                        sqlite3.wasm.poke8(sqlite3.wasm.ptr.add(pSql, sqlByteLen), 0);

                        // Compile and execute statements in sequence
                        while (pSql && sqlite3.wasm.peek8(pSql)) {
                            sqlite3.wasm.pokePtr([ppStmt, pzTail], 0);
                            const rc = sqlite3.capi.sqlite3_prepare_v2(
                                db.pointer,
                                pSql,
                                sqlByteLen,
                                ppStmt,
                                pzTail
                            );

                            if (rc !== 0) {
                                throw new Error(sqlite3.capi.sqlite3_errmsg(db.pointer));
                            }

                            const pStmt = sqlite3.wasm.peekPtr(ppStmt);
                            pSql = sqlite3.wasm.peekPtr(pzTail);
                            sqlByteLen = Number(sqlite3.wasm.ptr.add(pSqlEnd, -pSql));

                            if (!pStmt) continue;

                            // Wrap statement handle in oo1.Stmt class
                            const stmt = sqlite3.oo1.Stmt.wrapHandle(db, pStmt, true);
                            try {
                                const colCount = stmt.columnCount;
                                if (colCount > 0) {
                                    const columns = stmt.getColumnNames([]);
                                    const values = [];
                                    while (stmt.step()) {
                                        values.push(stmt.get([]));
                                    }
                                    results.push({ columns, values });
                                } else {
                                    stmt.step();
                                }
                            } finally {
                                stmt.finalize();
                            }
                        }
                    } finally {
                        sqlite3.wasm.scopedAllocPop(stack);
                    }

                    postMessage({
                        id: data.id,
                        results: results
                    });
                    break;
                }

                case "export": {
                    if (!db) {
                        throw new Error("Export failed: No database is currently opened.");
                    }

                    const byteArray = sqlite3.capi.sqlite3_js_db_export(db.pointer);
                    const result = {
                        id: data.id,
                        buffer: byteArray.buffer
                    };

                    try {
                        postMessage(result, [result.buffer]);
                    } catch (e) {
                        postMessage(result);
                    }
                    break;
                }

                case "close": {
                    if (db) {
                        db.close();
                        db = null;
                    }
                    postMessage({
                        id: data.id
                    });
                    break;
                }

                default:
                    throw new Error("Invalid action: " + data.action);
            }
        } catch (err) {
            postMessage({
                id: data.id,
                error: err.message
            });
        }
    }).catch(err => {
        postMessage({
            id: data.id,
            error: "Failed to initialize SQLite3 WASM backend: " + err.message
        });
    });
};
