# External/manual dollar-to-cents policy: pure-unit design

No production converter, validation policy, API change or database operation is
implemented. This evaluates strict decimal parsing and discrete double-neighborhood
recognition with test-only prototypes.

## Recommendation and the unavoidable tradeoff

Recommend **strict exact-decimal manual input as the default until an explicit
binary-neighborhood allowance is approved**. If accepting 0.1+0.2 is a product
requirement, the smallest practical extension is strict decimal strings plus
**one adjacent representable double** recognition for number inputs. That extension
is technically bounded and cent-unambiguous, but cannot prove caller intent.
Do not claim it accepts every ordinary floating arithmetic result, or rejects every
intentionally finer-precision number. A universal converter meeting both promises
is impossible once the original expression/spelling is lost.

0.30000000000000004 intentionally supplied and 0.1+0.2 are identical inputs. Likewise
an intentional one-step neighbor of .3 is indistinguishable from arithmetic noise.
This is not an implementation defect in the converter; input lacks provenance.
A tolerance rule must explicitly declare those neighboring numbers equivalent to
cents. Strict rejection is lower complexity and exact, but less convenient for
clients performing dollar-number arithmetic. Domain cents eliminates that internal
source of error, not external-client arithmetic.

## Exact one-step candidate (not a production recommendation without approval)

For finite number x:
1. Normalize signed zero to integer zero. Reject nonzero values mapping to cent zero.
2. Reject abs(x) greater than Number('9999999999.99'); do not extend the range by
   tolerance. Exact-string range is checked against 999999999999 integer cents.
3. Decode the IEEE-754 double into an exact nonnegative rational n/d. Multiply
   its numerator by 100 and derive the nearest integer-cent candidate c with
   integer quotient/remainder arithmetic. This is candidate discovery, not an
   acceptance rule; half-cent inputs are not accepted by it.
4. Require 1 <= c <= 999999999999. Construct the canonical decimal dollars for c
   using integer quotient and two-digit remainder; parse that text to the canonical
   double q(c). Do not construct a rounded-dollar intermediate from x.
5. For nonnegative finite doubles, their ordered 64-bit representations are monotone.
   Accept only if abs(bits(abs(x)) - bits(q(c))) <= 1. Otherwise reject precision.
6. Return signed c as a checked safe integer number. BigInt is only intermediate.

This is a discrete one-neighbor contract, not a fixed epsilon or x*100 precision
check. At exponent transitions the lower/upper spacing differs; bit distance
naturally uses the actual adjacent doubles. Zero has no recognition neighborhood,
so Number.MIN_VALUE is rejected rather than silently becoming zero.

Two-step recognition is also characterized, but no mathematical argument makes two
steps a universal bound for unknown computations. It accepts more deliberately
sub-cent numbers. Repeated addition and cancellation defeat any small fixed bound.
Number.EPSILON*abs(x) can overestimate spacing within a binade and mishandle zero;
actual neighbor counting makes the contract clearer. Exact binary examination does
not recover whether the double came from a typed decimal or arithmetic.

## Full-range proof and limits

For normal doubles in [2^e,2^(e+1)), spacing is 2^(e-52). At the schema maximum
(e=33), spacing is 2^-19 = 0.0000019073486328125 dollars. Independent cent centers
are therefore separated by at least 0.01 - 2^-19 dollars; one-step neighborhoods
have at most that spacing as their radius. Even two-step neighborhoods cannot
intersect: 4*2^-19 < 0.01-2^-19. There is at most one accepted cent candidate.

This proves uniqueness of the cent, NOT that the input contains no intentional
fractional precision. At the maximum the one-step allowance can change a numeric
input by about 0.00000190735 dollars. It rejects mill-dollar and half-cent offsets
(.001/.004/.005/.006/.009), but accepts intentionally supplied much smaller offsets
if they land in a permitted neighboring double.

Every cent maps to a DISTINCT double in the current numeric(12,2) range. Not every
cent is represented exactly as a binary rational: .01 and .3 are already approximations.
Dollar spacing first exceeds .01 at 2^46 dollars = 70,368,744,177,664, far beyond the
current range. For example the decimal strings 70368744177664.01 and .02 map to the
same double. Their integer cent values can still fit below MAX_SAFE_INTEGER, showing
why cent-integer safety alone does not prove dollar-double distinction.

Exact persistence limit is +/-9,999,999,999.99; cents magnitude 999999999999 is safely
below MAX_SAFE_INTEGER. A numeric input just above the canonical maximum is rejected,
even if it is only one step away. Original out-of-range decimal spellings that parse
to the SAME number as the maximum cannot be detected from a number alone. Strict
strings preserve that distinction.

## Known classifications

| Input | Strict canonical decimal | One-step number extension |
| --- | --- | --- |
| 0 / -0 | 0 cents | 0 cents |
| .01 / -.01 | +/-1 | +/-1 |
| .1, .2, .3 | 10,20,30 | 10,20,30 |
| .1+.2 / .30000000000000004 | reject | 30 |
| -.30000000000000004 | reject | -30 |
| .004/.005/.006 and negatives | reject | reject |
| .301/.304 and negatives | reject | reject |
| 1.004/1.005/1.006 and negatives | reject | reject |
| 1.234 / -1.234 | reject | reject |
| 12.34 / 12.340 | 1234 | 1234 |
| canonical schema maximum and negative | +/-999999999999 | same |

Strings use their decimal text directly, not Number(text) followed by tolerant
recognition. '0.30', '12.340', '1e-2' are exact; '0.30000000000000004' and '1e-400'
are not cent-exact. Trim surrounding whitespace, permit decimal sign/exponent and
trailing fractional zeros, reject empty/malformed/NaN/Infinity/hex/grouped-currency
text. Some forms previously accepted by Number/Vine coercion (e.g. hex) would narrow;
this must be documented as a validation-policy change, not an API field rename.

If numbers get recognition but strings remain strict, preserve original input type
BEFORE Vine numeric coercion. Otherwise '0.30000000000000004' loses its spelling and
would accidentally receive number recognition. Such type-specific semantics are
coherent and explainable, but are an intentional new contract decision.

## Arithmetic characterization

| Expression/result | One step | Two steps |
| --- | --- | --- |
| .1+.2 = .30000000000000004 | 30 | 30 |
| .7+.1 = .7999999999999999 | 80 | 80 |
| .3-.2 = .09999999999999998 | reject | 10 |
| 1.1+2.2 = 3.3000000000000003 | 330 | 330 |
| .1*3 = .30000000000000004 | 30 | 30 |
| .1*.1 = .010000000000000002 | 1 | 1 |
| .01*.5 = .005 | reject | reject |
| 100 additions of .01 = 1.0000000000000007 | reject | reject |
| 1000 additions of .01 = 9.999999999999831 | reject | reject |
| (1e9+.01)-1e9 = .009999990463256836 | reject | reject |

Enlarging the window to cover accumulated/cancellation errors has no defensible
bound without operand/expression information. Inputs known to be cents should use
integer-cent arithmetic, not depend on ingress to repair arbitrary expressions.
A double just below the next cent legitimately maps to that NEXT cent under the
extension; it is not classified relative to the previous cent.

## Parsing, symmetry and errors

Strict text parsing: sign + decimal digits + optional exponent -> exact scaled
integer. Remove only mathematically irrelevant zeroes. Reject if cents would require
nonzero fractional digits; check range before allocating powers or converting to
number. Handle very long text with linear scanning, existing request-size limits,
and digit/exponent range checks; avoid computing huge powers or converting a tiny
nonzero exponent string into zero via Number underflow. Any explicit new textual
length cap would be a separate documented input policy.

For numbers, reject NaN/Infinity/nonfinite and range overflow before recognition.
Unsupported kinds (objects, booleans, null, arrays) are not monetary representations;
keep structural/required validation separate. Negative zero becomes zero. The
recognition function is symmetric because it uses abs(x) for every check and only
reapplies the sign to the final integer. No negative-half Math.round policy is used.

Suggested future validation classes: required/syntax/finite number; currency
precision; currency range. Use existing HTTP 422 error reporting, without a new
error architecture. Output is checked integer Cents directly, never rounded float
dollars followed by another multiplication. Domain brands remain unimplemented.

## Future DTOs and remaining decision

Canonical decimal-string monetary DTOs eliminate original-spelling loss at ingress,
if callers construct them from cents/exact decimal input rather than stringify
already-inexact arithmetic. They do not retroactively reconstruct intent. Preserve
current dollar-number API compatibility in Scope 2 initially; consider exact strings
as a separately versioned hardening step, not a covert contract migration.

Decision required before implementation: strict all-input precision, or explicitly
approve a one-step (or other specified) NUMBER allowance and acknowledge it accepts
indistinguishable intentional precision while rejecting larger arithmetic error.
Do not call any window a guaranteed detection of harmless noise. Provider/legacy
policies remain separate architecture prerequisites.

## Verification

Five new pure-unit design tests passed: known examples, multi-magnitude neighborhoods,
full-range/zero safety, strict strings, and arithmetic/provenance. Matrix magnitudes
include .01, .30, $1, $12.34, $1000, $1 million and near the schema maximum, with
signed +/-1,2,3-step neighbors and .001/.004/.005/.006/.009 offsets. Adjacent-cent
non-overlap is tested at those samples and established globally by spacing bounds.
These are prototype characterization tests, not production regressions or policy.
