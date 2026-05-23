SQLite Viewer
=============

*View SQLite file online. Uses [sql.js](https://github.com/sql-js/sql.js) for parsing sqlite files.*

You can also load remote files (using JS ajax, remote server must send `Access-Control-Allow-Origin:*`) and prefill a SQL query using hash parameters:

- To load a remote SQLite file upon page load, append
  `#url=examples/Chinook_Sqlite.zip` to the URL. Both absolute and relative URLs work. So do zipped files.
- To prefill a SQL query, append
  `#sql=SELECT%20*%20FROM%20table` to the URL.
- To load a remote file and prefill a query at the same time: Append
  `#url=examples/Chinook_Sqlite.zip&sql=SELECT%20*%20FROM%20table`

Available hash parameters:
- `url` - URL of a remote SQLite file to load
- `sql` - SQL query to prefill in the editor

![](/img/preview.png?raw=true "Example sqlite")

Licensed under the Apache License, Version 2.0 — see [LICENSE](LICENSE) for details.
