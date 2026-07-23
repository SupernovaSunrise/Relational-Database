import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import sqlite3
import re
from datetime import datetime, timedelta
from pathlib import Path
from db import add_business_days, all_holidays_for_span

DB_PATH = Path(__file__).parent / "database.db"
CHECKOUT_PERIOD_DAYS = 120

EQUIPMENT_ID_PATTERN = re.compile(r"^[A-Z]{2}-\d{4}$")

class EquipmentCheckoutApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Veteran's Pantry DME")
        self.root.geometry("900x650")

        self.customer_search_var = tk.StringVar()
        self.equipment_search_var = tk.StringVar()

        # Initialize database
        self.init_db()

        # Create main frame
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(1, weight=1)

        # Create menu
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)

        # File menu
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="Exit", command=self.root.quit)

        # Customers menu
        customers_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Customers", menu=customers_menu)
        customers_menu.add_command(label="View Customers", command=self.show_customers)
        customers_menu.add_command(label="Add Customer", command=self.add_customer_dialog)

        # Equipment menu
        equipment_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Equipment", menu=equipment_menu)
        equipment_menu.add_command(label="View Equipment", command=self.show_equipment)
        equipment_menu.add_command(label="Add Equipment", command=self.add_equipment_dialog)

        # Actions menu
        actions_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Actions", menu=actions_menu)
        actions_menu.add_command(label="Checkout Equipment", command=self.checkout_dialog)
        actions_menu.add_command(label="Return Equipment", command=self.return_dialog)
        actions_menu.add_command(label="View Checked Out", command=self.show_checked_out)

        # Checkout menu
        checkout_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Checkout", menu=checkout_menu)
        checkout_menu.add_command(label="Checkout Equipment", command=self.checkout_dialog)
        checkout_menu.add_command(label="Return Equipment", command=self.return_dialog)
        checkout_menu.add_command(label="View Checked Out", command=self.show_checked_out)

        # Create notebook for tabs
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S))

        # Create tabs
        self.customers_tab = ttk.Frame(self.notebook)
        self.equipment_tab = ttk.Frame(self.notebook)
        self.checkout_tab = ttk.Frame(self.notebook)

        self.notebook.add(self.customers_tab, text="Customers")
        self.notebook.add(self.equipment_tab, text="Equipment")
        self.notebook.add(self.checkout_tab, text="Checkouts")

        # Setup tabs
        self.setup_customers_tab()
        self.setup_equipment_tab()
        self.setup_checkout_tab()

        # Status bar
        self.status_var = tk.StringVar()
        self.status_var.set("Ready")
        status_bar = ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN)
        status_bar.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E))

    def connect_db(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def find_customer_matches(self, customer_reference):
        conn = self.connect_db()
        cursor = conn.cursor()
        if customer_reference.isdigit():
            cursor.execute(
                "SELECT id, name, phone, zip_code FROM customers WHERE id = ?",
                (customer_reference,),
            )
            rows = cursor.fetchall()
            conn.close()
            return rows

        search_pattern = f"%{customer_reference}%"
        cursor.execute(
            "SELECT id, name, phone, zip_code FROM customers "
            "WHERE name LIKE ? OR phone LIKE ? OR zip_code LIKE ? "
            "ORDER BY name LIMIT 20",
            (search_pattern, search_pattern, search_pattern),
        )
        rows = cursor.fetchall()
        conn.close()
        return rows

    def select_customer_dialog(self, matches, reference):
        dialog = tk.Toplevel(self.root)
        dialog.title("Select Customer")
        dialog.geometry("550x260")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text=f"Multiple matches found for '\u201c{reference}\u201d'. Please select:").grid(row=0, column=0, columnspan=2, padx=10, pady=10, sticky=tk.W)

        columns = ("ID", "Name", "Phone", "ZIP")
        tree = ttk.Treeview(dialog, columns=columns, show="headings", height=8)
        for col in columns:
            tree.heading(col, text=col)
            tree.column(col, width=120)
        tree.grid(row=1, column=0, columnspan=2, padx=10, pady=5, sticky=(tk.W, tk.E, tk.N, tk.S))

        for row in matches:
            tree.insert("", tk.END, values=(row["id"], row["name"], row["phone"], row["zip_code"]))

        selected_customer = {'id': None}

        def select():
            selection = tree.selection()
            if not selection:
                messagebox.showerror("Error", "Please select a customer.")
                return
            selected_customer['id'] = tree.item(selection[0])['values'][0]
            dialog.destroy()

        ttk.Button(dialog, text="Select", command=select).grid(row=2, column=0, padx=10, pady=10, sticky=tk.E)
        ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=2, column=1, padx=10, pady=10, sticky=tk.W)

        dialog.wait_window()
        return selected_customer['id']

    def delete_customer_by_id(self, customer_id):
        conn = self.connect_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM loans WHERE customer_id = ? AND returned_date IS NULL",
            (customer_id,)
        )
        if cursor.fetchone():
            conn.close()
            messagebox.showerror("Error", "Cannot delete a customer with active checked out equipment.")
            return
        cursor.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
        conn.commit()
        conn.close()
        messagebox.showinfo("Success", "Customer deleted successfully.")
        self.refresh_customers()

    def delete_equipment_by_id(self, equipment_id):
        conn = self.connect_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM loans WHERE equipment_id = ? AND returned_date IS NULL",
            (equipment_id,)
        )
        if cursor.fetchone():
            conn.close()
            messagebox.showerror("Error", "Cannot delete equipment that is currently checked out.")
            return
        cursor.execute("DELETE FROM equipment WHERE equipment_id = ?", (equipment_id,))
        conn.commit()
        conn.close()
        messagebox.showinfo("Success", "Equipment deleted successfully.")
        self.refresh_equipment()

    def init_db(self):
        conn = self.connect_db()
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                zip_code TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS equipment (
                equipment_id TEXT PRIMARY KEY,
                item_name TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS loans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                equipment_id TEXT NOT NULL,
                checked_out_date TEXT NOT NULL,
                due_date TEXT NOT NULL,
                returned_date TEXT,
                FOREIGN KEY(customer_id) REFERENCES customers(id),
                FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id)
            )
            """
        )
        conn.commit()
        conn.close()

    def setup_customers_tab(self):
        # Buttons frame
        btn_frame = ttk.Frame(self.customers_tab)
        btn_frame.grid(row=0, column=0, pady=5, sticky=(tk.W, tk.E))

        ttk.Label(btn_frame, text="Search:").grid(row=0, column=0, padx=5, pady=2, sticky=tk.W)
        ttk.Entry(btn_frame, textvariable=self.customer_search_var, width=30).grid(row=0, column=1, padx=5, pady=2)
        ttk.Button(btn_frame, text="Search", command=self.search_customers).grid(row=0, column=2, padx=5)
        ttk.Button(btn_frame, text="Clear", command=self.clear_customer_search).grid(row=0, column=3, padx=5)
        ttk.Button(btn_frame, text="Add Customer", command=self.add_customer_dialog).grid(row=0, column=4, padx=5)
        ttk.Button(btn_frame, text="Delete Selected", command=self.delete_selected_customer).grid(row=0, column=5, padx=5)
        ttk.Button(btn_frame, text="Refresh", command=self.refresh_customers).grid(row=0, column=6, padx=5)

        # Treeview for customers
        columns = ("ID", "Name", "Phone", "Zip Code")
        self.customers_tree = ttk.Treeview(self.customers_tab, columns=columns, show="headings", height=15)

        for col in columns:
            self.customers_tree.heading(col, text=col)
            self.customers_tree.column(col, width=150)

        # Scrollbars
        v_scrollbar = ttk.Scrollbar(self.customers_tab, orient=tk.VERTICAL, command=self.customers_tree.yview)
        h_scrollbar = ttk.Scrollbar(self.customers_tab, orient=tk.HORIZONTAL, command=self.customers_tree.xview)
        self.customers_tree.configure(yscrollcommand=v_scrollbar.set, xscrollcommand=h_scrollbar.set)

        self.customers_tree.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        v_scrollbar.grid(row=1, column=1, sticky=(tk.N, tk.S))
        h_scrollbar.grid(row=2, column=0, sticky=(tk.W, tk.E))

        self.customers_tab.columnconfigure(0, weight=1)
        self.customers_tab.rowconfigure(1, weight=1)

        self.refresh_customers()

    def setup_equipment_tab(self):
        # Buttons frame
        btn_frame = ttk.Frame(self.equipment_tab)
        btn_frame.grid(row=0, column=0, pady=5, sticky=(tk.W, tk.E))

        ttk.Label(btn_frame, text="Search:").grid(row=0, column=0, padx=5, pady=2, sticky=tk.W)
        ttk.Entry(btn_frame, textvariable=self.equipment_search_var, width=30).grid(row=0, column=1, padx=5, pady=2)
        ttk.Button(btn_frame, text="Search", command=self.search_equipment).grid(row=0, column=2, padx=5)
        ttk.Button(btn_frame, text="Clear", command=self.clear_equipment_search).grid(row=0, column=3, padx=5)
        ttk.Button(btn_frame, text="Add Equipment", command=self.add_equipment_dialog).grid(row=0, column=4, padx=5)
        ttk.Button(btn_frame, text="Delete Selected", command=self.delete_selected_equipment).grid(row=0, column=5, padx=5)
        ttk.Button(btn_frame, text="Refresh", command=self.refresh_equipment).grid(row=0, column=6, padx=5)

        # Treeview for equipment
        columns = ("Equipment ID", "Item Name")
        self.equipment_tree = ttk.Treeview(self.equipment_tab, columns=columns, show="headings", height=15)

        for col in columns:
            self.equipment_tree.heading(col, text=col)
            self.equipment_tree.column(col, width=200)

        # Scrollbars
        v_scrollbar = ttk.Scrollbar(self.equipment_tab, orient=tk.VERTICAL, command=self.equipment_tree.yview)
        h_scrollbar = ttk.Scrollbar(self.equipment_tab, orient=tk.HORIZONTAL, command=self.equipment_tree.xview)
        self.equipment_tree.configure(yscrollcommand=v_scrollbar.set, xscrollcommand=h_scrollbar.set)

        self.equipment_tree.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        v_scrollbar.grid(row=1, column=1, sticky=(tk.N, tk.S))
        h_scrollbar.grid(row=2, column=0, sticky=(tk.W, tk.E))

        self.equipment_tab.columnconfigure(0, weight=1)
        self.equipment_tab.rowconfigure(1, weight=1)

        self.refresh_equipment()

    def setup_checkout_tab(self):
        # Buttons frame
        btn_frame = ttk.Frame(self.checkout_tab)
        btn_frame.grid(row=0, column=0, pady=5)

        ttk.Button(btn_frame, text="Checkout", command=self.checkout_dialog).grid(row=0, column=0, padx=5)
        ttk.Button(btn_frame, text="Return", command=self.return_dialog).grid(row=0, column=1, padx=5)
        ttk.Button(btn_frame, text="Refresh", command=self.refresh_checkouts).grid(row=0, column=2, padx=5)

        # Treeview for checkouts
        columns = ("Equipment ID", "Item Name", "Customer", "Checked Out", "Due Date")
        self.checkout_tree = ttk.Treeview(self.checkout_tab, columns=columns, show="headings", height=15)

        for col in columns:
            self.checkout_tree.heading(col, text=col)
            self.checkout_tree.column(col, width=120)

        # Scrollbars
        v_scrollbar = ttk.Scrollbar(self.checkout_tab, orient=tk.VERTICAL, command=self.checkout_tree.yview)
        h_scrollbar = ttk.Scrollbar(self.checkout_tab, orient=tk.HORIZONTAL, command=self.checkout_tree.xview)
        self.checkout_tree.configure(yscrollcommand=v_scrollbar.set, xscrollcommand=h_scrollbar.set)

        self.checkout_tree.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        v_scrollbar.grid(row=1, column=1, sticky=(tk.N, tk.S))
        h_scrollbar.grid(row=2, column=0, sticky=(tk.W, tk.E))

        self.checkout_tab.columnconfigure(0, weight=1)
        self.checkout_tab.rowconfigure(1, weight=1)

        self.refresh_checkouts()

    def refresh_customers(self, search=""):
        # Clear existing items
        for item in self.customers_tree.get_children():
            self.customers_tree.delete(item)

        # Load customers
        conn = self.connect_db()
        cursor = conn.cursor()
        if search:
            search_pattern = f"%{search}%"
            cursor.execute(
                "SELECT id, name, phone, zip_code FROM customers "
                "WHERE name LIKE ? OR phone LIKE ? OR zip_code LIKE ? "
                "ORDER BY name",
                (search_pattern, search_pattern, search_pattern),
            )
        else:
            cursor.execute("SELECT id, name, phone, zip_code FROM customers ORDER BY name")
        for row in cursor.fetchall():
            self.customers_tree.insert("", tk.END, values=(row["id"], row["name"], row["phone"], row["zip_code"]))
        conn.close()

    def search_customers(self):
        self.refresh_customers(self.customer_search_var.get().strip())

    def clear_customer_search(self):
        self.customer_search_var.set("")
        self.refresh_customers()

    def delete_selected_customer(self):
        selected = self.customers_tree.selection()
        if not selected:
            messagebox.showerror("Error", "Please select a customer to delete.")
            return
        customer_id = self.customers_tree.item(selected[0])['values'][0]
        self.delete_customer_by_id(customer_id)

    def refresh_equipment(self, search=""):
        # Clear existing items
        for item in self.equipment_tree.get_children():
            self.equipment_tree.delete(item)

        # Load equipment
        conn = self.connect_db()
        cursor = conn.cursor()
        if search:
            search_pattern = f"%{search}%"
            cursor.execute(
                "SELECT equipment_id, item_name FROM equipment "
                "WHERE equipment_id LIKE ? OR item_name LIKE ? "
                "ORDER BY equipment_id",
                (search_pattern, search_pattern),
            )
        else:
            cursor.execute("SELECT equipment_id, item_name FROM equipment ORDER BY equipment_id")
        for row in cursor.fetchall():
            self.equipment_tree.insert("", tk.END, values=(row["equipment_id"], row["item_name"]))
        conn.close()

    def search_equipment(self):
        self.refresh_equipment(self.equipment_search_var.get().strip())

    def clear_equipment_search(self):
        self.equipment_search_var.set("")
        self.refresh_equipment()

    def delete_selected_equipment(self):
        selected = self.equipment_tree.selection()
        if not selected:
            messagebox.showerror("Error", "Please select equipment to delete.")
            return
        equipment_id = self.equipment_tree.item(selected[0])['values'][0]
        self.delete_equipment_by_id(equipment_id)

    def refresh_checkouts(self):
        # Clear existing items
        for item in self.checkout_tree.get_children():
            self.checkout_tree.delete(item)

        # Load checkouts
        conn = self.connect_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT loans.equipment_id, equipment.item_name, customers.name, loans.checked_out_date, loans.due_date"
            " FROM loans"
            " JOIN equipment ON loans.equipment_id = equipment.equipment_id"
            " JOIN customers ON loans.customer_id = customers.id"
            " WHERE loans.returned_date IS NULL"
            " ORDER BY loans.due_date"
        )
        for row in cursor.fetchall():
            self.checkout_tree.insert("", tk.END, values=(
                row["equipment_id"], row["item_name"], row["name"],
                row["checked_out_date"], row["due_date"]
            ))
        conn.close()

    def add_customer_dialog(self):
        dialog = tk.Toplevel(self.root)
        dialog.title("Add Customer")
        dialog.geometry("400x250")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text="Customer Name:").grid(row=0, column=0, padx=5, pady=5, sticky=tk.W)
        name_entry = ttk.Entry(dialog, width=30)
        name_entry.grid(row=0, column=1, padx=5, pady=5)

        ttk.Label(dialog, text="Phone:").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
        phone_entry = ttk.Entry(dialog, width=30)
        phone_entry.grid(row=1, column=1, padx=5, pady=5)

        ttk.Label(dialog, text="Zip Code:").grid(row=2, column=0, padx=5, pady=5, sticky=tk.W)
        zip_entry = ttk.Entry(dialog, width=30)
        zip_entry.grid(row=2, column=1, padx=5, pady=5)

        def save_customer():
            name = name_entry.get().strip()
            phone = phone_entry.get().strip()
            zip_code = zip_entry.get().strip()

            if not name or not phone or not zip_code:
                messagebox.showerror("Error", "All fields are required.")
                return

            # Validate phone
            digits = re.sub(r"\D", "", phone)
            if len(digits) < 10:
                messagebox.showerror("Error", "Phone number must have at least 10 digits.")
                return

            # Validate zip code
            if not re.fullmatch(r"\d{5}", zip_code):
                messagebox.showerror("Error", "Zip code must be 5 digits.")
                return

            conn = self.connect_db()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    "INSERT INTO customers (name, phone, zip_code) VALUES (?, ?, ?)",
                    (name, phone, zip_code),
                )
                conn.commit()
                messagebox.showinfo("Success", f"Customer '{name}' added successfully.")
                self.refresh_customers()
                dialog.destroy()
            except sqlite3.IntegrityError:
                messagebox.showerror("Error", "Error adding customer.")
            finally:
                conn.close()

        ttk.Button(dialog, text="Save", command=save_customer).grid(row=3, column=0, padx=5, pady=10)
        ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=3, column=1, padx=5, pady=10)

    def add_equipment_dialog(self):
        dialog = tk.Toplevel(self.root)
        dialog.title("Add Equipment")
        dialog.geometry("400x150")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text="Equipment ID (AA-0000):").grid(row=0, column=0, padx=5, pady=5, sticky=tk.W)
        id_entry = ttk.Entry(dialog, width=30)
        id_entry.grid(row=0, column=1, padx=5, pady=5)

        ttk.Label(dialog, text="Item Name:").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
        name_entry = ttk.Entry(dialog, width=30)
        name_entry.grid(row=1, column=1, padx=5, pady=5)

        def save_equipment():
            equipment_id = id_entry.get().strip().upper()
            item_name = name_entry.get().strip()

            if not equipment_id or not item_name:
                messagebox.showerror("Error", "All fields are required.")
                return

            if not EQUIPMENT_ID_PATTERN.fullmatch(equipment_id):
                messagebox.showerror("Error", "Equipment ID must be in format AA-0000.")
                return

            conn = self.connect_db()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    "INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)",
                    (equipment_id, item_name),
                )
                conn.commit()
                messagebox.showinfo("Success", f"Equipment '{equipment_id}' added successfully.")
                self.refresh_equipment()
                dialog.destroy()
            except sqlite3.IntegrityError:
                messagebox.showerror("Error", "Equipment ID already exists.")
            finally:
                conn.close()

        ttk.Button(dialog, text="Save", command=save_equipment).grid(row=2, column=0, padx=5, pady=10)
        ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=2, column=1, padx=5, pady=10)

    def checkout_dialog(self):
        dialog = tk.Toplevel(self.root)
        dialog.title("Checkout Equipment")
        dialog.geometry("500x220")
        dialog.transient(self.root)
        dialog.grab_set()

        # Get available equipment
        conn = self.connect_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT equipment.equipment_id, equipment.item_name FROM equipment"
            " LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL"
            " WHERE loans.id IS NULL ORDER BY equipment.equipment_id"
        )
        equipment = cursor.fetchall()
        conn.close()

        if not equipment:
            messagebox.showerror("Error", "No available equipment. Please add equipment first.")
            dialog.destroy()
            return

        ttk.Label(dialog, text="Equipment ID:").grid(row=0, column=0, padx=5, pady=5, sticky=tk.W)
        equipment_entry = ttk.Entry(dialog, width=40)
        equipment_entry.grid(row=0, column=1, padx=5, pady=5)

        ttk.Label(dialog, text="Customer ID, Name, Phone, or ZIP:").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
        customer_entry = ttk.Entry(dialog, width=40)
        customer_entry.grid(row=1, column=1, padx=5, pady=5)

        ttk.Label(dialog, text="Available Equipment:").grid(row=2, column=0, padx=5, pady=5, sticky=tk.W)
        available_text = tk.Text(dialog, height=6, width=45, state=tk.DISABLED, wrap=tk.WORD)
        available_text.grid(row=2, column=1, padx=5, pady=5)
        available_list = "\n".join([f"{e['equipment_id']}: {e['item_name']}" for e in equipment])
        available_text.config(state=tk.NORMAL)
        available_text.insert(tk.END, available_list)
        available_text.config(state=tk.DISABLED)

        def resolve_customer_id(reference):
            matches = self.find_customer_matches(reference)
            if not matches:
                return None
            if len(matches) == 1:
                return matches[0]['id']
            selection = self.select_customer_dialog(matches, reference)
            return selection

        def checkout():
            equipment_id = equipment_entry.get().strip().upper()
            customer_reference = customer_entry.get().strip()

            if not equipment_id or not customer_reference:
                messagebox.showerror("Error", "Please enter both equipment ID and customer reference.")
                return

            customer_id = resolve_customer_id(customer_reference)
            if not customer_id:
                return

            conn = self.connect_db()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM loans WHERE equipment_id = ? AND returned_date IS NULL",
                (equipment_id,)
            )
            if cursor.fetchone():
                conn.close()
                messagebox.showerror("Error", "Equipment is already checked out or unavailable.")
                return

            checked_out_date = datetime.today().date()
            due_date = add_business_days(checked_out_date, CHECKOUT_PERIOD_DAYS, all_holidays_for_span(checked_out_date, CHECKOUT_PERIOD_DAYS + 30))

            cursor.execute(
                "INSERT INTO loans (customer_id, equipment_id, checked_out_date, due_date) VALUES (?, ?, ?, ?)",
                (customer_id, equipment_id, checked_out_date.isoformat(), due_date.isoformat()),
            )
            conn.commit()
            conn.close()

            messagebox.showinfo("Success", f"Equipment {equipment_id} checked out until {due_date.isoformat()}.")
            self.refresh_checkouts()
            dialog.destroy()

        ttk.Button(dialog, text="Checkout", command=checkout).grid(row=3, column=0, padx=5, pady=10)
        ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=3, column=1, padx=5, pady=10)

    def return_dialog(self):
        # Get checked out equipment
        conn = self.connect_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT loans.id, loans.equipment_id, equipment.item_name, customers.name, loans.checked_out_date, loans.due_date"
            " FROM loans"
            " JOIN equipment ON loans.equipment_id = equipment.equipment_id"
            " JOIN customers ON loans.customer_id = customers.id"
            " WHERE loans.returned_date IS NULL"
            " ORDER BY loans.due_date"
        )
        checked_out = cursor.fetchall()
        conn.close()

        if not checked_out:
            messagebox.showinfo("Info", "No equipment is currently checked out.")
            return

        dialog = tk.Toplevel(self.root)
        dialog.title("Return Equipment")
        dialog.geometry("760x320")
        dialog.transient(self.root)
        dialog.grab_set()

        ttk.Label(dialog, text="Select equipment to return:").grid(row=0, column=0, columnspan=2, padx=5, pady=5, sticky=tk.W)

        columns = ("Loan ID", "Equipment ID", "Item Name", "Customer", "Checked Out", "Due Date")
        tree = ttk.Treeview(dialog, columns=columns, show="headings", height=10)
        for col in columns:
            tree.heading(col, text=col)
            tree.column(col, width=120)
        tree.grid(row=1, column=0, columnspan=2, padx=10, pady=10, sticky=(tk.W, tk.E, tk.N, tk.S))

        for item in checked_out:
            tree.insert("", tk.END, values=(
                item["id"], item["equipment_id"], item["item_name"], item["name"], item["checked_out_date"], item["due_date"]
            ))

        def return_equipment():
            selection = tree.selection()
            if not selection:
                messagebox.showerror("Error", "Please select equipment to return.")
                return

            loan_id = tree.item(selection[0])['values'][0]
            returned_date = datetime.today().date().isoformat()
            conn = self.connect_db()
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE loans SET returned_date = ? WHERE id = ?",
                (returned_date, loan_id),
            )
            conn.commit()
            conn.close()

            messagebox.showinfo("Success", "Equipment returned successfully.")
            self.refresh_checkouts()
            dialog.destroy()

        ttk.Button(dialog, text="Return", command=return_equipment).grid(row=2, column=0, padx=10, pady=10, sticky=tk.E)
        ttk.Button(dialog, text="Cancel", command=dialog.destroy).grid(row=2, column=1, padx=10, pady=10, sticky=tk.W)

    def show_customers(self):
        self.notebook.select(self.customers_tab)

    def show_equipment(self):
        self.notebook.select(self.equipment_tab)

    def show_checked_out(self):
        self.notebook.select(self.checkout_tab)

def main():
    root = tk.Tk()
    app = EquipmentCheckoutApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()