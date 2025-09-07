#!/bin/bash
LOG_FILE="console.log"
echo "Starting application and redirecting console output to $LOG_FILE"
npm start > $LOG_FILE 2>&1
