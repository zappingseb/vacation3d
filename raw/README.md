# raw/

Drop the original GPX files of a vacation into `raw/<id>/` and run

```bash
python3 clean_tool/clean_gpx.py --id <id>
```

Everything in here except this file is **gitignored**: GPX tracks carry timestamps and
therefore tell where you were at what time. Only the generated `data/<id>.js` is committed.
