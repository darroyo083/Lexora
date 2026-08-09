package com.lexora.correction.infrastructure;

import com.lexora.correction.domain.AnswerKey;

import java.util.Optional;
import java.util.UUID;

public interface AnswerKeyRepository {
    Optional<AnswerKey> findByBookId(UUID bookId);
    void save(AnswerKey key);
    boolean existsByBookId(UUID bookId);
}
