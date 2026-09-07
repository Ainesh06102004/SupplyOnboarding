// ============================================================================
// KOI — Marketplace errors
//
// A small taxonomy KOI owns, because the provider does not offer one: Swiggy's
// symbolic `error.code` registry is documented as planned, not shipped, so
// classification today means branching on HTTP status and message text. That
// fragile matching belongs in the adapter, behind these types — never in a
// route handler or a component.
//
// The distinction that matters to callers is `retryable`: whether trying again
// could plausibly help, or whether the answer will be the same.
// ============================================================================

export class MarketplaceError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, retryable?: boolean, cause?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "MarketplaceError";
    this.code = opts.code || "MARKETPLACE_ERROR";
    this.retryable = opts.retryable ?? false;
    if (opts.cause) this.cause = opts.cause;
  }
}

/** No adapter is configured, or the configured one needs credentials KOI lacks. */
export class NotConfiguredError extends MarketplaceError {
  constructor(message = "No marketplace adapter is configured") {
    super(message, { code: "NOT_CONFIGURED", retryable: false });
    this.name = "NotConfiguredError";
  }
}

/**
 * The provider's quota is exhausted.
 *
 * Retryable in principle, but the caller must NOT simply retry: the correct
 * response is to degrade to stale or unknown. Retrying against a breached
 * quota is what turns throttling into a ban.
 */
export class RateLimitError extends MarketplaceError {
  constructor(message = "Marketplace rate limit reached", retryAfterMs = null) {
    super(message, { code: "RATE_LIMITED", retryable: true });
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** The provider does not deliver to this zone. A definite answer, not a failure. */
export class NotServiceableError extends MarketplaceError {
  constructor(message = "Marketplace does not serve this area") {
    super(message, { code: "NOT_SERVICEABLE", retryable: false });
    this.name = "NotServiceableError";
  }
}

/** The provider was unreachable or too slow. */
export class UpstreamError extends MarketplaceError {
  constructor(message = "Marketplace did not respond", cause) {
    super(message, { code: "UPSTREAM", retryable: true, cause });
    this.name = "UpstreamError";
  }
}

/**
 * The destructive call was sent and its outcome is unknown.
 *
 * NOT a failure, and the difference is the whole point. `update_cart` replaces
 * the provider's cart; if the request times out or the connection drops, the
 * cart may well have been replaced and KOI simply was not told. Reporting that
 * as "nothing was ordered" is a false statement about someone's shopping, and
 * retrying it would replace the cart a second time from a plan already acted
 * on — the exact thing the exactly-once claim exists to prevent.
 *
 * So the plan STAYS claimed and this is raised instead. `retryable` is false
 * deliberately: the answer is not to try again, it is to go and look.
 */
export class HandoffUnconfirmedError extends MarketplaceError {
  constructor(message = "Hand-off sent but not confirmed", cause) {
    super(message, { code: "HANDOFF_UNCONFIRMED", retryable: false, cause });
    this.name = "HandoffUnconfirmedError";
  }
}

/**
 * The caller's session with the provider is gone.
 *
 * Expected, not exceptional: Swiggy's tokens last five days and v1.0 issues no
 * refresh token, so re-authentication is a normal part of the lifecycle rather
 * than an error to alarm anyone about.
 */
export class AuthExpiredError extends MarketplaceError {
  constructor(message = "Marketplace session expired") {
    super(message, { code: "AUTH_EXPIRED", retryable: false });
    this.name = "AuthExpiredError";
  }
}
