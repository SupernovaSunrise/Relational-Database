# Durable Medical Equipment Checkout Database

A simple database system for tracking durable medical equipment and customer checkouts with multiple user interfaces.

## Features

- Customer data: name, phone number, zip code
- Equipment data: ID in format `AA-0000`, item name
- Checkout equipment to a customer for 120 days
- Return equipment when it is back
- List customers, equipment, and currently checked out items
- Multiple user interfaces: CLI, Web, and Desktop GUI

## Interfaces

### Command Line Interface (CLI)

Run the interactive command-line application:

```bash
python main.py
```

### Web Interface

1. Install Flask:
```bash
pip install -r requirements.txt
```

2. Run the web application:
```bash
python web_app.py
```

3. Open your browser and go to `http://localhost:5000`

### Desktop GUI

Run the desktop graphical user interface:

```bash
python desktop_app.py
```

## Storage

- Data is stored in `database.db` in the repository folder.
- The database is created automatically on first run.

## Notes

- Equipment IDs must follow the format `AA-0000`.
- Phone numbers are validated for at least 10 digits.
- Zip codes must be 5 digits.
