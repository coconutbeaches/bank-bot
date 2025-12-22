#!/bin/bash

echo "Bangkok Bank Slip Processing Monitor"
echo "===================================="
echo ""

while true; do
  clear
  echo "Bangkok Bank Slip Processing Monitor - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=============================================================="
  echo ""
  
  # Check if process is running
  if pgrep -f "process_bbl_slips" > /dev/null; then
    echo "✅ Process is RUNNING"
  else
    echo "❌ Process is NOT running"
  fi
  echo ""
  
  # Show last 5 log lines
  echo "Last log entries:"
  echo "-----------------"
  tail -5 /Users/tyler/Projects/bbl_process_full.log 2>/dev/null || echo "No log file yet"
  echo ""
  
  # Count files
  echo "File counts:"
  echo "------------"
  echo "Total images: 4313"
  echo ""
  
  echo "Press Ctrl+C to stop monitoring"
  echo ""
  
  sleep 5
done
