package com.lexora.assist.application;

import com.lexora.assist.infrastructure.AssistRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AssistQuotaServiceTest {

    @Test
    void snapshotExposesOnlyEffectiveSessionAllowance() {
        var repository = mock(AssistRepository.class);
        var configuration = mock(AssistConfiguration.class);
        var today = LocalDate.of(2026, 8, 18);
        when(configuration.sessionDailyLimit()).thenReturn(10);
        when(repository.sessionCallCount("session", today)).thenReturn(Optional.of(3));

        var quota = new AssistQuotaService(repository, configuration)
            .snapshot("session", today);

        assertThat(quota.used()).isEqualTo(3);
        assertThat(quota.limit()).isEqualTo(10);
        assertThat(quota.remaining()).isEqualTo(7);
    }

    @Test
    void snapshotClampsExhaustedAndNegativeConfigurationSafely() {
        var repository = mock(AssistRepository.class);
        var configuration = mock(AssistConfiguration.class);
        var today = LocalDate.of(2026, 8, 18);
        when(configuration.sessionDailyLimit()).thenReturn(-1);
        when(repository.sessionCallCount("session", today)).thenReturn(Optional.of(12));

        var quota = new AssistQuotaService(repository, configuration)
            .snapshot("session", today);

        assertThat(quota.used()).isEqualTo(12);
        assertThat(quota.limit()).isZero();
        assertThat(quota.remaining()).isZero();
    }
}
