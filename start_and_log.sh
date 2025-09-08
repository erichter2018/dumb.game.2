#!/bin/bash
LOG_FILE="console.log"
echo "Deleting previous log file and starting application..."
rm -f $LOG_FILE
echo "Starting application and redirecting console output to $LOG_FILE"
npm start > $LOG_FILE 2>&1
