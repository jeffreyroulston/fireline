//! Wald sequential probability ratio test for noisy deck score comparisons.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SprtDecision {
    Continue,
    /// Neighbor is better than the reference with the configured confidence.
    Accept,
    /// Neighbor is not better than the reference.
    Reject,
}

/// One-sided SPRT: H0 mean <= reference, H1 mean >= reference + delta.
#[derive(Clone, Debug)]
pub struct SprtTest {
    reference: f64,
    delta: f64,
    log_a: f64,
    log_b: f64,
    log_ratio_sum: f64,
    count: u32,
    min_samples: u32,
    sum: f64,
    sum_sq: f64,
    variance: f64,
}

impl SprtTest {
    pub fn new(reference: f64) -> Self {
        let alpha = 0.05_f64;
        let beta = 0.20_f64;
        let delta = (reference.abs() * 0.02).max(0.25);
        Self {
            reference,
            delta,
            log_a: ((1.0 - beta) / alpha).ln(),
            log_b: (beta / (1.0 - alpha)).ln(),
            log_ratio_sum: 0.0,
            count: 0,
            min_samples: 4,
            sum: 0.0,
            sum_sq: 0.0,
            variance: 4.0,
        }
    }

    pub fn observe_batch(&mut self, damages: &[u8]) -> SprtDecision {
        for &damage in damages {
            let value = f64::from(damage);
            self.count += 1;
            self.sum += value;
            self.sum_sq += value * value;
            if self.count >= 2 {
                let mean = self.sum / f64::from(self.count);
                let sample_var =
                    (self.sum_sq - f64::from(self.count) * mean * mean) / f64::from(self.count - 1);
                self.variance = sample_var.max(0.25);
            }
            let sigma_sq = self.variance.max(0.25);
            self.log_ratio_sum +=
                (self.delta / sigma_sq) * (value - self.reference - self.delta / 2.0);
        }
        self.decision()
    }

    pub fn decision(&self) -> SprtDecision {
        if self.count < self.min_samples {
            return SprtDecision::Continue;
        }
        if self.log_ratio_sum >= self.log_a {
            SprtDecision::Accept
        } else if self.log_ratio_sum <= self.log_b {
            SprtDecision::Reject
        } else {
            SprtDecision::Continue
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_clearly_worse_neighbor() {
        let mut sprt = SprtTest::new(10.0);
        let decision = sprt.observe_batch(&[4, 5, 4, 5, 4, 5, 4, 5]);
        assert_eq!(decision, SprtDecision::Reject);
    }

    #[test]
    fn accepts_clearly_better_neighbor() {
        let mut sprt = SprtTest::new(10.0);
        let decision = sprt.observe_batch(&[14, 15, 14, 15, 14, 15, 14, 15]);
        assert_eq!(decision, SprtDecision::Accept);
    }
}
