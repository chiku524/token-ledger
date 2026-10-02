//! Unit tests for the shared, pure invariant helpers. These run on the host
//! toolchain and pin the arithmetic both programs rely on.

use crate::{coverage_within_expiry, day_index, SECONDS_PER_DAY, THIRTY_DAYS_SECONDS};

#[test]
fn day_index_is_a_fixed_utc_window_not_a_rolling_one() {
    // Two times in the same UTC day share an index; one second later crosses.
    assert_eq!(day_index(0), 0);
    assert_eq!(day_index(SECONDS_PER_DAY - 1), 0);
    assert_eq!(day_index(SECONDS_PER_DAY), 1);
    assert_eq!(day_index(SECONDS_PER_DAY + 5), 1);
    // Before the epoch, flooring still groups correctly.
    assert_eq!(day_index(-1), -1);
    assert_eq!(day_index(-SECONDS_PER_DAY), -1);
    assert_eq!(day_index(-SECONDS_PER_DAY - 1), -2);
}

#[test]
fn coverage_starts_at_now_when_there_is_no_backlog() {
    let now = 1_000_000;
    let expiry = now + 10 * THIRTY_DAYS_SECONDS;
    assert!(coverage_within_expiry(now, now, expiry));
}

#[test]
fn coverage_starts_at_paid_through_to_avoid_backlog_billing() {
    // paid_through is in the future (already covered), so coverage starts there.
    let now = 1_000_000;
    let paid_through = now + THIRTY_DAYS_SECONDS;
    let expiry = paid_through + 10 * THIRTY_DAYS_SECONDS;
    assert!(coverage_within_expiry(now, paid_through, expiry));
    // A long backlog of missed periods is not billed: only one period is added.
    let very_old = now - 100 * THIRTY_DAYS_SECONDS;
    assert!(coverage_within_expiry(now, very_old, now + THIRTY_DAYS_SECONDS));
}

#[test]
fn coverage_must_end_within_the_authorization_expiry() {
    let now = 1_000_000;
    // Expiry sooner than one period from now: coverage would run past it.
    assert!(!coverage_within_expiry(now, now, now + THIRTY_DAYS_SECONDS - 1));
    // Exactly one period fits.
    assert!(coverage_within_expiry(now, now, now + THIRTY_DAYS_SECONDS));
}

#[test]
fn coverage_does_not_overflow_on_extreme_expiry() {
    // A cap on expiry means the addition cannot overflow in practice, but the
    // helper still returns false rather than panicking if it does.
    assert!(!coverage_within_expiry(i64::MAX - 10, i64::MAX - 10, i64::MAX));
}
