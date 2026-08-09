package com.lexora.book.infrastructure;

import com.lexora.book.domain.BookProfile;

import java.util.Optional;
import java.util.UUID;

public interface BookProfileRepository {
    Optional<BookProfile> findById(UUID id);
    Optional<BookProfile> findByEditionKey(String editionKey);
}
