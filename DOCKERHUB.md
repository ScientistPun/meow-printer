# Meow Printer

A web-based CUPS print server with a clean interface for LAN printers.

## Features

- **Web Interface**: Upload files and send print jobs directly from your browser
- **Multi-format Support**: PDF, JPG, PNG, DOC, DOCX
- **N-up Printing**: Print 2, 4, 6, or 9 pages per sheet
- **Custom Page Ranges**: Print specific pages (e.g., 1,3,5-10)
- **Page Scaling**: Fit to page or custom scaling percentage
- **Orientation**: Portrait and landscape modes
- **Auto-loaded Fonts**: Automatically detects fonts in the fonts directory
- **Chinese Font Support**: Pre-installed Noto CJK fonts

## Quick Start

```bash
# Pull and run
docker pull scientistpun/meow-printer:latest
docker-compose up -d

# Or run directly
docker run -d \
  --name meow-printer \
  -p 3000:3000 \
  -e CUPS_HOST=192.168.10.1 \
  -e CUPS_PORT=631 \
  -v /var/run/cups.sock:/var/run/cups.sock:ro \
  scientistpun/meow-printer:latest
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CUPS_HOST` | 192.168.10.1 | CUPS server address |
| `CUPS_PORT` | 631 | CUPS server port |

### Volumes

| Path | Description |
|------|-------------|
| `/var/run/cups.sock` | CUPS socket (read-only) |
| `/app/public/uploads` | Uploaded files (persistent) |
| `/app/public/cache` | Cache files (persistent) |
| `/app/public/fonts` | Custom fonts directory (persistent) |
| `/app/logs` | Application logs (persistent) |

### Data Persistence

For production use, mount host directories to preserve data:

```yaml
volumes:
  - ./data/uploads:/app/public/uploads
  - ./data/cache:/app/public/cache
  - ./fonts:/app/public/fonts
  - ./logs:/app/logs
```

## Custom Fonts

Place font files (.ttf, .otf, .ttc) in the fonts directory. Fonts are auto-loaded on startup.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/printers` | List available printers |
| POST | `/api/print` | Submit print job |
| GET | `/api/jobs` | List print jobs |
| DELETE | `/api/jobs/:id` | Cancel print job |
| GET | `/api/fonts` | List available fonts |
| POST | `/api/fonts` | Upload new font |

## Links

- [GitHub Repository](https://github.com/ScientistPun/meow-printer)

## License

MIT
