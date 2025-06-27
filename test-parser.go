package main

import (
	"fmt"
	"log"
	"os"
	"strconv"
)

// Copy the MarcProcessor struct and parsing functions from main.go but just parse a few records for testing
// This is a minimal test to debug the MARC parsing

func main() {
	log.Println("Testing MARC parser with sample records...")
	
	// Read just the first 10KB of the MARC file to test parsing
	file, err := os.Open("/app/marc.mrc")
	if err != nil {
		log.Fatal("Cannot open MARC file:", err)
	}
	defer file.Close()
	
	buffer := make([]byte, 10240) // 10KB
	n, err := file.Read(buffer)
	if err != nil {
		log.Fatal("Cannot read MARC file:", err)
	}
	
	fmt.Printf("Read %d bytes from MARC file\n", n)
	
	// Try to identify record boundaries
	recordCount := 0
	pos := 0
	
	for pos < n-24 {
		// Check if this looks like a MARC leader
		leader := string(buffer[pos:pos+24])
		
		// Try to parse record length
		recordLengthStr := leader[:5]
		fmt.Printf("Potential record %d at position %d, length field: '%s'\n", recordCount+1, pos, recordLengthStr)
		
		if recordLengthStr[0] >= '0' && recordLengthStr[0] <= '9' {
			if recordLength, err := strconv.Atoi(recordLengthStr); err == nil && recordLength > 24 && recordLength < 100000 {
				fmt.Printf("  Valid record length: %d\n", recordLength)
				fmt.Printf("  Leader: %s\n", leader)
				
				recordCount++
				pos += recordLength
				
				if recordCount >= 3 { // Just test first 3 records
					break
				}
			} else {
				pos++
			}
		} else {
			pos++
		}
	}
	
	fmt.Printf("Found %d potential MARC records\n", recordCount)
}