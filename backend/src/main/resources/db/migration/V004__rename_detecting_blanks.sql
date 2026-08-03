UPDATE book_pages
SET processing_status = 'DETECTING_INTERACTIONS'
WHERE processing_status = 'DETECTING_BLANKS';
