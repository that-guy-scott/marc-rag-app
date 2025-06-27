package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/elastic/go-elasticsearch/v8"
	"github.com/elastic/go-elasticsearch/v8/esapi"
)

type MarcRecord struct {
	ControlNumber    string   `json:"controlNumber"`
	Title           string   `json:"title"`
	Author          string   `json:"author"`
	Publisher       string   `json:"publisher"`
	PublicationYear int      `json:"publicationYear,omitempty"`
	ISBN            string   `json:"isbn"`
	Subjects        []string `json:"subjects"`
	Description     string   `json:"description"`
	Language        string   `json:"language"`
	Format          string   `json:"format"`
	SearchableText  string   `json:"searchableText"`
	Embedding       []float32 `json:"embedding,omitempty"`
	IndexedAt       string   `json:"indexed_at"`
}

type MarcField struct {
	Tag        string
	Indicator1 byte
	Indicator2 byte
	Subfields  []Subfield
}

type Subfield struct {
	Code byte
	Data string
}

type MarcProcessor struct {
	esClient  *elasticsearch.Client
	ollamaURL string
	indexName string
}

type OllamaEmbeddingRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type OllamaEmbeddingResponse struct {
	Embedding []float32 `json:"embedding"`
}

func NewMarcProcessor(esClient *elasticsearch.Client, ollamaURL string) *MarcProcessor {
	return &MarcProcessor{
		esClient:  esClient,
		ollamaURL: ollamaURL,
		indexName: "marc-records",
	}
}

// parseMarcRecord parses a single MARC record from binary data
func (mp *MarcProcessor) parseMarcRecord(data []byte) (*MarcRecord, error) {
	if len(data) < 24 {
		return nil, fmt.Errorf("record too short")
	}

	// Parse leader
	leader := string(data[:24])
	
	// Get record length from leader
	recordLengthStr := leader[:5]
	recordLength, err := strconv.Atoi(recordLengthStr)
	if err != nil {
		return nil, fmt.Errorf("invalid record length: %v", err)
	}

	if len(data) < recordLength {
		return nil, fmt.Errorf("incomplete record")
	}

	// Get base address of data
	baseAddressStr := leader[12:17]
	baseAddress, err := strconv.Atoi(baseAddressStr)
	if err != nil {
		return nil, fmt.Errorf("invalid base address: %v", err)
	}

	// Parse directory - need to find directory terminator
	directoryStart := 24
	var directoryEnd int
	for i := directoryStart; i < baseAddress; i++ {
		if data[i] == 0x1E { // Field terminator marks end of directory
			directoryEnd = i
			break
		}
	}
	if directoryEnd == 0 {
		directoryEnd = baseAddress - 1
	}
	
	directory := data[directoryStart:directoryEnd]
	
	var fields []MarcField
	
	// Parse directory entries (12 bytes each)
	for i := 0; i < len(directory); i += 12 {
		if i+12 > len(directory) {
			break
		}
		
		tag := strings.TrimSpace(string(directory[i : i+3]))
		lengthStr := strings.TrimSpace(string(directory[i+3 : i+7]))
		offsetStr := strings.TrimSpace(string(directory[i+7 : i+12]))
		
		length, err := strconv.Atoi(lengthStr)
		if err != nil {
			log.Printf("Invalid field length for tag %s: %s", tag, lengthStr)
			continue
		}
		
		offset, err := strconv.Atoi(offsetStr)
		if err != nil {
			log.Printf("Invalid field offset for tag %s: %s", tag, offsetStr)
			continue
		}
		
		// Calculate field position - offset is relative to base address
		fieldStart := baseAddress + offset
		fieldEnd := fieldStart + length
		
		if fieldEnd > len(data) {
			log.Printf("Field %s extends beyond record boundary", tag)
			continue
		}
		
		fieldData := data[fieldStart:fieldEnd]
		
		// Parse field based on tag
		if tag < "010" { // Control fields
			// Control fields don't have indicators or subfields
			continue
		} else { // Data fields
			if len(fieldData) < 3 {
				continue
			}
			
			field := MarcField{
				Tag:        tag,
				Indicator1: fieldData[0],
				Indicator2: fieldData[1],
			}
			
			// Parse subfields - remove field terminator first
			subfieldData := fieldData[2:]
			// Remove field terminator if present
			if len(subfieldData) > 0 && subfieldData[len(subfieldData)-1] == 0x1E {
				subfieldData = subfieldData[:len(subfieldData)-1]
			}
			
			var subfields []Subfield
			
			// Start parsing subfields - first subfield should start with delimiter
			j := 0
			for j < len(subfieldData) {
				if subfieldData[j] == 0x1F { // Subfield delimiter
					j++
					if j < len(subfieldData) {
						code := subfieldData[j]
						j++
						
						// Find end of subfield (next delimiter or end of field)
						start := j
						for j < len(subfieldData) && subfieldData[j] != 0x1F {
							j++
						}
						
						if start <= len(subfieldData) {
							var data string
							if start < len(subfieldData) {
								data = string(subfieldData[start:j])
							}
							// Clean up the data - remove trailing punctuation and whitespace
							data = strings.TrimSpace(data)
							data = strings.TrimRight(data, ".,;:/")
							data = strings.TrimSpace(data)
							
							if data != "" {
								subfields = append(subfields, Subfield{
									Code: code,
									Data: data,
								})
							}
						}
					}
				} else {
					j++
				}
			}
			
			field.Subfields = subfields
			fields = append(fields, field)
		}
	}

	// Extract bibliographic data
	record := mp.extractFields(fields)
	record.IndexedAt = time.Now().Format(time.RFC3339)
	
	return record, nil
}

// extractFields extracts key bibliographic fields from parsed MARC fields
func (mp *MarcProcessor) extractFields(fields []MarcField) *MarcRecord {
	record := &MarcRecord{
		Subjects: make([]string, 0),
	}


	for _, field := range fields {
		switch field.Tag {
		case "245": // Title
			var titleParts []string
			for _, sf := range field.Subfields {
				switch sf.Code {
				case 'a': // Main title
					titleParts = append(titleParts, sf.Data)
				case 'b': // Subtitle
					titleParts = append(titleParts, sf.Data)
				case 'c': // Statement of responsibility (skip for title)
					// Don't include statement of responsibility in title
				}
			}
			if len(titleParts) > 0 {
				record.Title = strings.Join(titleParts, " : ")
				record.Title = strings.TrimSpace(record.Title)
			}
			
		case "100", "110", "111": // Author (Personal name, Corporate name, Meeting name)
			if record.Author == "" { // Only take the first author field
				for _, sf := range field.Subfields {
					if sf.Code == 'a' {
						record.Author = strings.TrimSpace(sf.Data)
						// Remove trailing commas that often appear in author names
						record.Author = strings.TrimRight(record.Author, ",")
						break
					}
				}
			}
			
		case "260", "264": // Publication info (Imprint, Production)
			for _, sf := range field.Subfields {
				switch sf.Code {
				case 'a': // Place of publication (we can skip this for now)
					// Skip place of publication
				case 'b': // Publisher
					if record.Publisher == "" { // Only take first publisher
						publisher := strings.TrimSpace(sf.Data)
						publisher = strings.TrimRight(publisher, ",:.")
						publisher = strings.TrimSpace(publisher)
						if publisher != "" {
							record.Publisher = publisher
						}
					}
				case 'c': // Date
					if record.PublicationYear == 0 { // Only take first date
						yearRegex := regexp.MustCompile(`\d{4}`)
						if match := yearRegex.FindString(sf.Data); match != "" {
							if year, err := strconv.Atoi(match); err == nil && year > 1000 && year < 3000 {
								record.PublicationYear = year
							}
						}
					}
				}
			}
			
		case "020": // ISBN
			if record.ISBN == "" { // Only take first ISBN
				for _, sf := range field.Subfields {
					if sf.Code == 'a' {
						isbn := strings.TrimSpace(sf.Data)
						// Clean ISBN - remove qualifiers in parentheses
						if idx := strings.Index(isbn, "("); idx != -1 {
							isbn = strings.TrimSpace(isbn[:idx])
						}
						// Remove hyphens and spaces for validation
						cleanISBN := strings.ReplaceAll(strings.ReplaceAll(isbn, "-", ""), " ", "")
						// Basic ISBN validation (10 or 13 digits)
						if len(cleanISBN) == 10 || len(cleanISBN) == 13 {
							isNumeric := true
							for _, r := range cleanISBN {
								if r < '0' || (r > '9' && r != 'X' && r != 'x') {
									isNumeric = false
									break
								}
							}
							if isNumeric {
								record.ISBN = isbn
								break
							}
						}
					}
				}
			}
			
		case "650", "651", "653": // Subjects
			for _, sf := range field.Subfields {
				if sf.Code == 'a' {
					subject := strings.TrimSuffix(sf.Data, ".")
					record.Subjects = append(record.Subjects, subject)
				}
			}
			
		case "520": // Summary/Description
			for _, sf := range field.Subfields {
				if sf.Code == 'a' {
					record.Description = sf.Data
					break
				}
			}
			
		case "041": // Language
			for _, sf := range field.Subfields {
				if sf.Code == 'a' {
					record.Language = sf.Data
					break
				}
			}
		}
	}

	// Create searchable text
	record.SearchableText = mp.createSearchableText(record)
	
	return record
}

// createSearchableText combines relevant fields for search
func (mp *MarcProcessor) createSearchableText(record *MarcRecord) string {
	var parts []string
	
	if record.Title != "" {
		parts = append(parts, record.Title)
	}
	if record.Author != "" {
		parts = append(parts, record.Author)
	}
	if record.Publisher != "" {
		parts = append(parts, record.Publisher)
	}
	if record.Description != "" {
		parts = append(parts, record.Description)
	}
	if len(record.Subjects) > 0 {
		parts = append(parts, strings.Join(record.Subjects, " "))
	}
	
	return strings.Join(parts, " ")
}

// generateEmbedding calls Ollama to generate embeddings
func (mp *MarcProcessor) generateEmbedding(text string) ([]float32, error) {
	if text == "" {
		return nil, nil
	}

	// Limit text length
	if len(text) > 8000 {
		text = text[:8000]
	}

	reqBody := OllamaEmbeddingRequest{
		Model:  "nomic-embed-text",
		Prompt: text,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	resp, err := http.Post(mp.ollamaURL+"/api/embeddings", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ollama API returned status %d", resp.StatusCode)
	}

	var response OllamaEmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, err
	}

	return response.Embedding, nil
}

// createIndex creates the Elasticsearch index with proper mapping
func (mp *MarcProcessor) createIndex() error {
	// Check if index exists
	req := esapi.IndicesExistsRequest{
		Index: []string{mp.indexName},
	}
	
	res, err := req.Do(context.Background(), mp.esClient)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	
	if res.StatusCode == 200 {
		fmt.Printf("Index %s already exists\n", mp.indexName)
		return nil
	}

	// Create index mapping
	mapping := `{
		"mappings": {
			"properties": {
				"controlNumber": { "type": "keyword" },
				"title": { 
					"type": "text",
					"analyzer": "english",
					"fields": {
						"keyword": { "type": "keyword" }
					}
				},
				"author": { 
					"type": "text",
					"analyzer": "english",
					"fields": {
						"keyword": { "type": "keyword" }
					}
				},
				"publisher": { 
					"type": "text",
					"analyzer": "english",
					"fields": {
						"keyword": { "type": "keyword" }
					}
				},
				"publicationYear": { "type": "integer" },
				"isbn": { "type": "keyword" },
				"subjects": { 
					"type": "text",
					"analyzer": "english"
				},
				"description": { 
					"type": "text",
					"analyzer": "english"
				},
				"language": { "type": "keyword" },
				"format": { "type": "keyword" },
				"searchableText": { 
					"type": "text",
					"analyzer": "english"
				},
				"embedding": {
					"type": "dense_vector",
					"dims": 768
				},
				"indexed_at": { "type": "date" }
			}
		},
		"settings": {
			"number_of_shards": 1,
			"number_of_replicas": 0
		}
	}`

	req2 := esapi.IndicesCreateRequest{
		Index: mp.indexName,
		Body:  strings.NewReader(mapping),
	}

	res2, err := req2.Do(context.Background(), mp.esClient)
	if err != nil {
		return err
	}
	defer res2.Body.Close()

	if res2.IsError() {
		return fmt.Errorf("error creating index: %s", res2.String())
	}

	fmt.Printf("Created index: %s\n", mp.indexName)
	return nil
}

// ProcessFile processes a MARC file and indexes records to Elasticsearch
func (mp *MarcProcessor) ProcessFile(filePath string, batchSize int) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	// Create index
	if err := mp.createIndex(); err != nil {
		return err
	}

	data, err := io.ReadAll(file)
	if err != nil {
		return err
	}

	var records []*MarcRecord
	var totalRecords, processedRecords, errorCount int
	
	fmt.Printf("Processing MARC file: %s\n", filePath)
	fmt.Printf("File size: %d bytes\n", len(data))

	// Parse records from binary data
	pos := 0
	for pos < len(data) {
		if pos+5 >= len(data) {
			break
		}

		// Get record length from leader
		recordLengthStr := string(data[pos : pos+5])
		recordLength, err := strconv.Atoi(recordLengthStr)
		if err != nil {
			fmt.Printf("Error parsing record length at position %d: %v\n", pos, err)
			pos++
			continue
		}

		if pos+recordLength > len(data) {
			fmt.Printf("Incomplete record at position %d\n", pos)
			break
		}

		recordData := data[pos : pos+recordLength]
		totalRecords++

		record, err := mp.parseMarcRecord(recordData)
		if err != nil {
			errorCount++
			fmt.Printf("Error parsing record %d: %v\n", totalRecords, err)
			pos += recordLength
			continue
		}

		// Skip records without title
		if record.Title == "" {
			pos += recordLength
			continue
		}

		// Generate embedding
		if record.SearchableText != "" {
			embedding, err := mp.generateEmbedding(record.SearchableText)
			if err != nil {
				fmt.Printf("Warning: Failed to generate embedding for record %d: %v\n", totalRecords, err)
			} else {
				record.Embedding = embedding
			}
		}

		records = append(records, record)
		processedRecords++

		// Index batch when it reaches batchSize
		if len(records) >= batchSize {
			if err := mp.indexBatch(records); err != nil {
				return fmt.Errorf("error indexing batch: %v", err)
			}
			fmt.Printf("Indexed %d records (total processed: %d)\n", len(records), processedRecords)
			records = records[:0] // Clear slice
		}

		pos += recordLength
	}

	// Index remaining records
	if len(records) > 0 {
		if err := mp.indexBatch(records); err != nil {
			return fmt.Errorf("error indexing final batch: %v", err)
		}
		fmt.Printf("Indexed final batch of %d records\n", len(records))
	}

	fmt.Printf("\n✅ Processing complete!\n")
	fmt.Printf("Total records found: %d\n", totalRecords)
	fmt.Printf("Records processed: %d\n", processedRecords)
	fmt.Printf("Errors: %d\n", errorCount)

	return nil
}

// indexBatch indexes a batch of records to Elasticsearch
func (mp *MarcProcessor) indexBatch(records []*MarcRecord) error {
	var buf bytes.Buffer

	for i, record := range records {
		// Index operation
		meta := map[string]interface{}{
			"index": map[string]interface{}{
				"_index": mp.indexName,
				"_id":    fmt.Sprintf("marc_%d_%d", time.Now().Unix(), i),
			},
		}
		metaJSON, _ := json.Marshal(meta)
		buf.Write(metaJSON)
		buf.WriteByte('\n')

		// Document
		docJSON, _ := json.Marshal(record)
		buf.Write(docJSON)
		buf.WriteByte('\n')
	}

	req := esapi.BulkRequest{
		Body:    strings.NewReader(buf.String()),
		Refresh: "false",
	}

	res, err := req.Do(context.Background(), mp.esClient)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("bulk indexing failed: %s", res.String())
	}

	return nil
}

func main() {
	// Configuration
	esURL := getEnv("ELASTICSEARCH_URL", "http://localhost:9200")
	esUsername := getEnv("ELASTICSEARCH_USERNAME", "elastic")
	esPassword := getEnv("ELASTICSEARCH_PASSWORD", "marc-rag-password-2024")
	ollamaURL := getEnv("OLLAMA_URL", "http://localhost:11434")
	
	marcFile := getEnv("MARC_FILE", "../marc.mrc")
	batchSize, _ := strconv.Atoi(getEnv("BATCH_SIZE", "100"))

	// Create Elasticsearch client
	cfg := elasticsearch.Config{
		Addresses: []string{esURL},
		Username:  esUsername,
		Password:  esPassword,
	}

	es, err := elasticsearch.NewClient(cfg)
	if err != nil {
		log.Fatalf("Error creating Elasticsearch client: %v", err)
	}

	// Test Elasticsearch connection
	res, err := es.Info()
	if err != nil {
		log.Fatalf("Error connecting to Elasticsearch: %v", err)
	}
	defer res.Body.Close()

	fmt.Println("✅ Connected to Elasticsearch")

	// Create processor and process file
	processor := NewMarcProcessor(es, ollamaURL)
	
	if err := processor.ProcessFile(marcFile, batchSize); err != nil {
		log.Fatalf("Error processing MARC file: %v", err)
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}