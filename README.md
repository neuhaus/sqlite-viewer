SQLite Viewer
=============

*View SQLite file online directly in your browser.*

You can also load remote files (using JS ajax, remote server must send `Access-Control-Allow-Origin:*`) 
and prefill a SQL query using hash parameters:

- To load a remote SQLite file upon page load, append<br>
  `#url=examples/Chinook_Sqlite.zip` to the URL. Both absolute and relative URLs work. So do zipped files.
- To prefill a SQL query, append<br>
  `#sql=SELECT%20*%20FROM%20table` to the URL.
- To load a remote file *and* prefill a query at the same time: Append both like this:<br>
  `#url=examples/Chinook_Sqlite.zip&sql=SELECT%20*%20FROM%20table`

![](/img/preview.png?raw=true "Screenshot")

## Libraries

- Using the official [sqlite3-wasm](https://sqlite.org/wasm/doc/trunk/index.md) for parsing sqlite files.
- Can handle SQLite files in ZIP files, thanks to [jszip](https://stuk.github.io/jszip/).
- Enjoy query editing with SQL syntax highlighting thanks to [CodeJar](https://medv.io/codejar/) and [PrismJS](https://prismjs.com/).
- Using [jQuery](https://jquery.com/) 4.0 slim, [Bootstrap](https://getbootstrap.com/) 5.3.8, [select2](https://select2.org/) and [FileSaver.js](https://github.com/eligrey/FileSaver.js/).

## License

Licensed under the Apache License, Version 2.0 — see [LICENSE](LICENSE) for details.
