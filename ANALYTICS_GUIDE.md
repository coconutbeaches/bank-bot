# Analytics Dashboard - Quick Start Guide

## 🎨 Overview

The `analytics.html` file provides a beautiful, interactive web dashboard for visualizing your Bangkok Bank payment slip data.

![Dashboard Features](https://img.shields.io/badge/Charts-5-blue) ![Interactive-Yes-green](https://img.shields.io/badge/Interactive-Yes-green) ![Setup-5min-orange](https://img.shields.io/badge/Setup-5min-orange)

---

## 📊 Features

### Statistics Cards
- **Total Transactions** - Complete count of all payment slips
- **Total Amount** - Sum of all transactions in THB
- **Average Transaction** - Mean transaction value
- **Recipients** - Number of unique recipients

### Interactive Charts

1. **📅 Daily Spending (Last 30 Days)**
   - Bar chart showing daily transaction totals
   - Helps identify spending patterns and spikes

2. **📊 Monthly Spending**
   - Monthly aggregated view across all time periods
   - Great for budget tracking and trend analysis

3. **📈 Yearly Spending**
   - Annual totals for long-term financial overview
   - Compare year-over-year spending

4. **👥 Top 10 Recipients**
   - Horizontal bar chart of biggest recipients by total amount
   - Quickly see where most money goes

5. **🏷️ Top Categories (by Note)**
   - Table showing transaction categories from note fields
   - Breakdown by count and total amount
   - Top 15 categories displayed

---

## 🚀 How to Use

### Step 1: Open the Dashboard

Simply open `analytics.html` in any modern web browser:

```bash
# From terminal:
open analytics.html

# Or double-click the file in Finder
```

### Step 2: Get Your Supabase Credentials

You'll need two pieces of information from your Supabase project:

#### Supabase URL
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **Project URL**
   - Format: `https://xxxxxxxxxxxxx.supabase.co`

#### Supabase Anon Key
1. In the same **Settings** → **API** page
2. Copy the **anon/public** key
   - This is safe to use in the browser
   - It's called "anon" key in the dashboard

### Step 3: Connect to Your Database

1. Paste your **Supabase URL** into the first field
2. Paste your **Supabase Anon Key** into the second field
3. Click **"Connect & Load Data"**

The dashboard will:
- ✅ Test the connection
- ✅ Load all payment slip data
- ✅ Generate interactive charts
- ✅ Calculate statistics

### Step 4: Explore Your Data

Once loaded, you can:
- **Hover** over bars to see exact values
- **Scroll** through all charts
- **Analyze** spending patterns
- **Identify** top recipients and categories

---

## 🔐 Security Notes

### Is it safe to use my Anon Key?

**Yes!** The Supabase Anon Key is designed to be used in browsers. It's a public key with limited permissions.

**However**, make sure your Supabase table has the correct permissions:

#### Option 1: Disable Row Level Security (Simple)
If this is just your personal data:
```sql
-- Run in Supabase SQL Editor
ALTER TABLE payment_slips DISABLE ROW LEVEL SECURITY;
```

#### Option 2: Enable RLS with Public Read Access (Recommended)
For better security:
```sql
-- Enable RLS
ALTER TABLE payment_slips ENABLE ROW LEVEL SECURITY;

-- Allow anyone with the anon key to read
CREATE POLICY "Allow public read access"
ON payment_slips
FOR SELECT
TO anon
USING (true);
```

### Data Privacy

- All data processing happens **in your browser**
- No data is sent to external servers (except Supabase)
- Your credentials are **not stored** (enter them each time)
- Chart.js and Supabase libraries are loaded from CDN

---

## 💡 Tips & Tricks

### Tip 1: Bookmark for Quick Access
Save your Supabase credentials in a password manager, then bookmark the local HTML file for instant access.

### Tip 2: Share Screenshots
The charts are rendered beautifully - perfect for sharing insights with others (just screenshot!)

### Tip 3: Filter by Date Range
Currently shows all-time data. To filter:
- Daily chart: automatically filters to last 30 days
- Other charts: show complete history

### Tip 4: Export Data
While the dashboard is view-only, you can:
- Use the TypeScript utility scripts for data export
- Query Supabase directly via SQL Editor
- Use Supabase's built-in CSV export

---

## 🐛 Troubleshooting

### "Connection failed" error

**Possible causes:**
1. Incorrect Supabase URL or Key
2. Row Level Security blocking access
3. Table doesn't exist or is named differently

**Solution:**
- Double-check credentials from Supabase dashboard
- Verify RLS policies (see Security Notes above)
- Confirm table name is `payment_slips`

### Charts not showing

**Possible causes:**
1. No data in database
2. Missing `date_time` or `amount_thb` fields

**Solution:**
- Run processing scripts to populate data
- Check browser console (F12) for errors

### "Failed to load data" error

**Possible causes:**
1. Network issue
2. Column names don't match
3. Supabase project is paused

**Solution:**
- Check internet connection
- Verify table schema matches expected format
- Unpause Supabase project if needed

---

## 🎯 What's Next?

### Possible Enhancements

Want to customize the dashboard? Edit `analytics.html`:

1. **Add More Charts**
   - Pie chart for expense categories
   - Line chart for spending trends
   - Donut chart for recipient distribution

2. **Add Filters**
   - Date range picker
   - Recipient filter
   - Amount range filter

3. **Add Export**
   - Download chart as PNG
   - Export filtered data as CSV
   - Print-friendly report view

4. **Add Forecasting**
   - Predict next month's spending
   - Budget tracking and alerts
   - Year-end projections

---

## 📚 Technical Details

### Libraries Used

- **Chart.js v4.4.0** - Beautiful, responsive charts
- **Supabase JS Client v2** - Database connection
- **Vanilla JavaScript** - No frameworks, fast loading

### Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+

### File Size

- HTML + CSS + JS: ~20KB (single file)
- External libraries: ~200KB (loaded from CDN)
- Total page load: <500ms on decent connection

---

## 🤝 Contributing

Ideas for improvements? Edit `analytics.html` and:
1. Add your feature
2. Test in multiple browsers
3. Share with others!

---

## Created

October 21, 2025 - Interactive analytics dashboard for Bangkok Bank slip data
