on run {startX, startY, endX, endY}
    tell application "iPhone Mirroring"
        activate
    end tell
    tell application "System Events"
        -- Move to starting position
        set mouse position to {startX, startY}
        -- Mouse down using cliclick
        do shell script "/usr/bin/cliclick dd:" & startX & "," & startY
        -- Pause to ensure the click is registered
        delay 0.2
        -- Move to ending position
        set mouse position to {endX, endY}
        -- Pause to ensure the drag is registered
        delay 0.2
        -- Mouse up using cliclick
        do shell script "/usr/bin/cliclick du:" & endX & "," & endY
    end tell
end run

