[![Android Arsenal](https://img.shields.io/badge/Android%20Arsenal-SQLite%20Viewer-brightgreen.svg?style=flat)](http://android-arsenal.com/details/1/2497)

SQLite Viewer
============

*View SQLite file online. Uses [sql.js](https://github.com/sql-js/sql.js) for parsing sqlite files.*

You can also load remote files (using JS ajax, remote server must send `Access-Control-Allow-Origin:*`) and prefill a SQL query using hash parameters:

- Load a remote SQLite file:
  `http://example.org/sqlite-viewer/#url=http://example.com/data.sqlite`
- Prefill a SQL query:
  `http://example.org/sqlite-viewer/#sql=SELECT%20*%20FROM%20table`
- Load a remote file and prefill a query at the same time:
  `http://example.org/sqlite-viewer/#url=http://example.com/data.sqlite&sql=SELECT%20*%20FROM%20table`

Available hash parameters:
- `url` - URL of a remote SQLite file to load
- `sql` - SQL query to prefill in the editor

![](/img/preview.png?raw=true "Example sqlite")

Licensed under the Apache License, Version 2.0 — see [LICENSE](LICENSE) for details.
