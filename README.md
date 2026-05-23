SQLite Viewer
=============

*View SQLite file online. Uses [sql.js](https://github.com/sql-js/sql.js) for parsing sqlite files.*

You can load SQLite files in ZIP files, thanks to [jszip](https://stuk.github.io/jszip/).

You can also load remote files (using JS ajax, remote server must send `Access-Control-Allow-Origin:*`) 
and prefill a SQL query using hash parameters:

- To load a remote SQLite file upon page load, append<br>
  `#url=examples/Chinook_Sqlite.zip` to the URL. Both absolute and relative URLs work. So do zipped files.
- To prefill a SQL query, append<br>
  `#sql=SELECT%20*%20FROM%20table` to the URL.
- To load a remote file *and* prefill a query at the same time: Append both like this:<br>
  `#url=examples/Chinook_Sqlite.zip&sql=SELECT%20*%20FROM%20table`

![](/img/preview.png?raw=true "Example sqlite")

Licensed under the Apache License, Version 2.0 — see [LICENSE](LICENSE) for details.
