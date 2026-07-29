UPDATE book_pages
SET processing_status = 'OCR'
WHERE processing_status = 'PROCESSING';
