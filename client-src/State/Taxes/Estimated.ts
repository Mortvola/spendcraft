import { DateTime } from "luxon";
import { FilingStatus } from "../../../common/ResponseTypes";

type WorksheetPeriod = 1 | 2 | 3 | 4;

interface Worksheet29Constants {
  annualizationFactors: readonly [number, number, number, number];
  applicablePercentages: readonly [number, number, number, number];
  socialSecurityLimits: readonly [number, number, number, number];
  seSocialSecurityFactors: readonly [number, number, number, number];
  seMedicareFactors: readonly [number, number, number, number];
  seDeductionDivisors: readonly [number, number, number, number];
  periodEndMonth: readonly [number, number, number, number];
}

export const WORKSHEET_2_9_2026: Worksheet29Constants = {
  annualizationFactors: [4, 2.4, 1.5, 1],

  applicablePercentages: [
      0.225,
      0.45,
      0.675,
      0.90
  ],

  socialSecurityLimits: [
      46_125,
      76_875,
      123_000,
      184_500
  ],

  seSocialSecurityFactors: [
      0.496,
      0.2976,
      0.186,
      0.124
  ],

  seMedicareFactors: [
      0.116,
      0.0696,
      0.0435,
      0.029
  ],

  seDeductionDivisors: [
      8,
      4.8,
      3,
      2
  ],

  periodEndMonth: [
    3, 5, 8, 12,
  ]
};

export const getCurrentPeriod = (): number => {
  const month = DateTime.now().month

  let period = 3;

  for (let i = 2; i >= 0; i -= 1) {
    if (month > WORKSHEET_2_9_2026.periodEndMonth[i]) {
      break;
    }

    period = i;
  }

  return period;
}

/**
 * Cumulative amounts through the end of a Worksheet 2-9 period.
 *
 * Period 1: Jan 1 - Mar 31
 * Period 2: Jan 1 - May 31
 * Period 3: Jan 1 - Aug 31
 * Period 4: Jan 1 - Dec 31
 */
interface Worksheet29PeriodInput {
  /**
   * Line 1:
   * Adjusted gross income for the period.
   */
  agi: number;

  /**
   * Line 4:
   * Itemized deductions for the period.
   */
  itemizedDeductions?: number;

  /**
   * Line 7:
   * Standard deduction calculated under the
   * Worksheet 2-9 instructions.
   */
  standardDeductionPlusCharity?: number;

  /**
   * Line 9a:
   * Qualified business income deduction.
   */
  qualifiedBusinessIncomeDeduction?: number;

  /**
   * Line 9b:
   * Applicable Schedule 1-A additional deductions.
   */
  schedule1AAdditionalDeductions?: number;

  /**
   * Taxes for line 13 BEFORE multiplying by
   * the annualization factor on line 2.
   */
  line13TaxesBeforeAnnualization?: number;

  /**
   * Line 15:
   * Nonrefundable credits.
   */
  nonrefundableCredits?: number;

  /**
   * Line 17:
   * Annualized self-employment tax from
   * Section B, line 41.
   */
  selfEmploymentTax?: number;

  /**
   * Line 18:
   * Other taxes.
   */
  otherTaxes?: number;

  /**
   * Line 20:
   * Refundable credits.
   */
  refundableCredits?: number;

  /**
   * Line 31:
   * Cumulative estimated tax payments and
   * withholding applicable through this period.
   */
  paymentsAndWithholding?: number;
}

interface Worksheet29Input {
  /**
   * Exactly four cumulative periods.
   */
  periods: readonly [
      Worksheet29PeriodInput,
      Worksheet29PeriodInput,
      Worksheet29PeriodInput,
      Worksheet29PeriodInput
  ];

  taxCalculationCallback: (taxableIncome: number, period: number) => Worksheet210Result;

  /**
   * Worksheet 2-1, line 12c.
   *
   * Worksheet 2-9 line 26 is 25% of this amount.
   */
  estimatedTaxWorksheetLine12c: number;

  /**
   * Worksheet 2-9 line 29 normally uses:
   *
   *   min(line25, line28)
   *
   * The worksheet permits line 25 to be used instead
   * in the circumstances described in the instructions.
   */
  useLine25InsteadOfLine28?: boolean;
}

interface Worksheet29Lines {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  7: number;
  8: number;

  "9a": number;
  "9b": number;

  10: number;
  11: number;
  12: number;
  13: number;
  14: number;
  15: number;
  16: number;
  17: number;
  18: number;
  19: number;
  20: number;
  21: number;
  22: number;
  23: number;
  24: number;
  25: number;
  26: number;
  27: number;
  28: number;
  29: number;
  30: number;
  31: number;
  32: number;
}

export interface Worksheet29PeriodResult {
  period: WorksheetPeriod;
  description: string;
  lines: Worksheet29Lines;
  worksheet2_10: Worksheet210Result;
}

/**
 * IRS Publication 505 (2026)
 * Worksheet 2-9
 * Annualized Estimated Tax Worksheet
 */
export function worksheet2_9_2026(
    input: Worksheet29Input
): Worksheet29PeriodResult[] {
  const {
      periods,
      estimatedTaxWorksheetLine12c,
      useLine25InsteadOfLine28 = false
  } = input;

  const results: Worksheet29PeriodResult[] = [];

  const descriptions = [
      "January 1 - March 31",
      "January 1 - May 31",
      "January 1 - August 31",
      "January 1 - December 31"
  ] as const;

  for (let i = 0; i < periods.length; i++) {
    const periodInput = periods[i];

    const annualizationFactor = WORKSHEET_2_9_2026.annualizationFactors[i];

    /*
      * -------------------------------------------------------
      * Lines 1-3
      * Annualize adjusted gross income
      * -------------------------------------------------------
      */

    // Line 1
    const line1 = periodInput.agi;

    // Line 2
    const line2 = annualizationFactor;

    // Line 3
    const line3 = line1 * line2;

    /*
      * -------------------------------------------------------
      * Lines 4-8
      * Deductions
      * -------------------------------------------------------
      */

    // Line 4
    const line4 = periodInput.itemizedDeductions ?? 0;

    // Line 5
    const line5 = annualizationFactor;

    // Line 6
    const line6 = line4 * line5;

    // Line 7
    const line7 = periodInput.standardDeductionPlusCharity ?? 0;

    // Line 8
    const line8 = Math.max(line6, line7);

    /*
      * -------------------------------------------------------
      * Lines 9a-11
      * Taxable income
      * -------------------------------------------------------
      */

    // Line 9a
    const line9a = periodInput.qualifiedBusinessIncomeDeduction ?? 0;

    // Line 9b
    const line9b = periodInput.schedule1AAdditionalDeductions ?? 0;

    // Line 10
    const line10 =
        line8 +
        line9a +
        line9b;

    // Line 11
    const line11 =
        Math.max(
            0,
            line3 - line10
        );

    /*
      * -------------------------------------------------------
      * Line 12
      * Income tax
      * -------------------------------------------------------
      *
      * Depending on the taxpayer, this may come from:
      *
      *   - 2026 Tax Rate Schedule
      *   - Worksheet 2-10
      *   - Worksheet 2-11
      */

    const worksheet2_10 = input.taxCalculationCallback(line11, i);
    const line12 =  worksheet2_10.tax;

    /*
      * -------------------------------------------------------
      * Line 13
      * Additional taxes subject to annualization
      * -------------------------------------------------------
      */

    const line13 = (periodInput.line13TaxesBeforeAnnualization ?? 0) * annualizationFactor;

    /*
      * -------------------------------------------------------
      * Lines 14-16
      * Tax after nonrefundable credits
      * -------------------------------------------------------
      */

    // Line 14
    const line14 = line12 + line13;

    // Line 15
    const line15 = periodInput.nonrefundableCredits ?? 0;

    // Line 16
    const line16 = Math.max(0, line14 - line15);

    /*
      * -------------------------------------------------------
      * Line 17
      * Self-employment tax
      * -------------------------------------------------------
      */

    const line17 = periodInput.selfEmploymentTax ?? 0;

    /*
      * -------------------------------------------------------
      * Lines 18-21
      * Total tax after refundable credits
      * -------------------------------------------------------
      */

    // Line 18
    const line18 = periodInput.otherTaxes ?? 0;

    // Line 19
    const line19 =
        line16 +
        line17 +
        line18;

    // Line 20
    const line20 = periodInput.refundableCredits ?? 0;

    // Line 21
    const line21 = Math.max(0, line19 - line20);

    /*
      * -------------------------------------------------------
      * Lines 22-23
      * Applicable annualized-income percentage
      * -------------------------------------------------------
      */

    // Line 22
    const line22 = WORKSHEET_2_9_2026.applicablePercentages[i];

    // Line 23
    const line23 = line21 * line22;

    /*
      * -------------------------------------------------------
      * Lines 24-25
      * Annualized-income installment
      * -------------------------------------------------------
      */

    /*
      * Line 24:
      *
      * Add line 29 from ALL previous columns.
      */
    const line24 =
      results.reduce(
        (
          total: number,
          previous: Worksheet29PeriodResult
        ) => {
          return (
            total + previous.lines[29]
          );
        },
        0
      );

    // Line 25
    const line25 = Math.max(0, line23 - line24);

    /*
      * -------------------------------------------------------
      * Line 26
      *
      * 25% of Worksheet 2-1 line 12c.
      * -------------------------------------------------------
      */

    const line26 = estimatedTaxWorksheetLine12c * 0.25;

    /*
      * -------------------------------------------------------
      * Line 27
      *
      * Previous column:
      *
      *   line 28 - line 29
      *
      * First column has no previous column.
      * -------------------------------------------------------
      */

    let line27 = 0;

    if (i > 0) {
      const previous = results[i - 1];

      line27 = previous.lines[28] - previous.lines[29];
    }

    /*
      * -------------------------------------------------------
      * Line 28
      * -------------------------------------------------------
      */

    const line28 = line26 + line27;

    /*
      * -------------------------------------------------------
      * Line 29
      * Required installment
      * -------------------------------------------------------
      */

    let line29 = Math.min(line25, line28);

    /*
      * Optional Worksheet 2-9 instruction:
      *
      * In the circumstances specified by the IRS,
      * line 25 may be entered instead of line 28.
      */
    if (
      useLine25InsteadOfLine28 &&
      line28 < line25
    ) {
      line29 = line25;
    }


    /*
      * -------------------------------------------------------
      * Line 30
      * -------------------------------------------------------
      */

    const line30 = line24 + line29;

    /*
      * -------------------------------------------------------
      * Line 31
      *
      * Cumulative payments and withholding.
      * -------------------------------------------------------
      */

    const line31 = periodInput.paymentsAndWithholding ?? 0;

    /*
      * -------------------------------------------------------
      * Line 32
      *
      * Estimated tax payment required.
      * -------------------------------------------------------
      */

    const line32 =
      Math.max(
        0,
        line30 - line31
      );

    const period = (i + 1) as WorksheetPeriod;

    results.push({
      period,
      description: descriptions[i],
      lines: {
        1: line1,
        2: line2,
        3: line3,
        4: line4,
        5: line5,
        6: line6,
        7: line7,
        8: line8,

        "9a": line9a,
        "9b": line9b,

        10: line10,
        11: line11,
        12: line12,
        13: line13,
        14: line14,
        15: line15,
        16: line16,
        17: line17,
        18: line18,
        19: line19,
        20: line20,
        21: line21,
        22: line22,
        23: line23,
        24: line24,
        25: line25,
        26: line26,
        27: line27,
        28: line28,
        29: line29,
        30: line30,
        31: line31,
        32: line32
      },
      worksheet2_10,
    });
  }

  return results;
}

interface Worksheet210Input {
  filingStatus: FilingStatus;

  /**
   * Worksheet 2-10 line 1:
   * Worksheet 2-9 line 11, or Worksheet 2-11 line 3.
   */
  line1: number;

  /**
   * Worksheet 2-10 line 2:
   * Annualized qualified dividends.
   */
  line2: number;

  /**
   * Worksheet 2-10 line 3:
   * Annualized net capital gain.
   */
  line3: number;

  /**
   * Worksheet 2-10 line 5:
   * Annualized 28% rate gain or loss.
   */
  line5?: number;

  /**
   * Worksheet 2-10 line 6:
   * Annualized unrecaptured section 1250 gain.
   */
  line6?: number;
}

interface Worksheet210Lines {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  7: number;
  8: number;
  9: number;
  10: number;
  11: number;
  12: number;
  "13a": number;
  "13b": number;
  "13c": number;
  14: number;
  15: number;
  16: number;
  17: number;
  18: number;
  19: number;
  20: number;
  21: number;
  22: number;
  23: number;
  24: number;
  25: number;
  26: number;
  27: number;
  28: number;
  29: number;
  30: number;
  31: number;
  32: number;
  33: number;
  34: number;
  35: number;
  36: number;
  37: number;
  38: number;
  39: number;
  40: number;
}

interface Worksheet210Result {
  tax: number;
  lines: Worksheet210Lines;
}

interface CapitalGainThresholds {
  line11: number;
  line13b: number;
  line19: number;
}

const CAPITAL_GAIN_THRESHOLDS_2026: Record<
  FilingStatus,
  CapitalGainThresholds
> = {
  Single: {
    line11: 49_450,
    line13b: 201_775,
    line19: 545_500
  },

  MarriedFilingSeparate: {
    line11: 49_450,
    line13b: 201_775,
    line19: 306_850
  },

  HeadOfHousehold: {
    line11: 66_200,
    line13b: 201_750,
    line19: 579_600
  },

  MarriedFilingJointly: {
    line11: 98_900,
    line13b: 403_550,
    line19: 613_700
  },

  QualifyingSurvivingSpouse: {
    line11: 98_900,
    line13b: 403_550,
    line19: 613_700
  }
};


/**
 * IRS Publication 505 (2026)
 * Worksheet 2-10
 *
 * Qualified Dividends and Capital Gain Tax Worksheet
 * for Worksheet 2-9, line 12.
 */
export function worksheet2_10_2026(
  input: Worksheet210Input
): Worksheet210Result {
  const {
    filingStatus,
    line1,
    line2,
    line3,
    line5 = 0,
    line6 = 0
  } = input;

  const thresholds =
    CAPITAL_GAIN_THRESHOLDS_2026[filingStatus];

  /*
   * ------------------------------------------------------------
   * Lines 4-14
   * ------------------------------------------------------------
   */

  // Line 4
  const line4 =
    line2 + line3;

  // Line 7
  const line7 =
    line5 + line6;

  // Line 8
  const line8 =
    Math.min(
      line3,
      line7
    );

  // Line 9
  const line9 =
    line4 - line8;

  // Line 10
  const line10 =
    Math.max(
      0,
      line1 - line9
    );

  // Line 11
  const line11 =
    Math.min(
      line1,
      thresholds.line11
    );

  // Line 12
  const line12 =
    Math.min(
      line10,
      line11
    );

  // Line 13a
  const line13a =
    Math.max(
      0,
      line1 - line4
    );

  // Line 13b
  const line13b =
    Math.min(
      line1,
      thresholds.line13b
    );

  // Line 13c
  const line13c =
    Math.min(
      line10,
      line13b
    );

  // Line 14
  const line14 =
    Math.max(
      line13a,
      line13c
    );


  /*
   * ------------------------------------------------------------
   * Line 15
   *
   * If lines 11 and 12 are equal, the IRS says to skip line 15.
   *
   * A skipped line 15 is treated as zero by line 17.
   * ------------------------------------------------------------
   */

  const line15 =
    line11 === line12
      ? 0
      : line11 - line12;


  /*
   * ------------------------------------------------------------
   * Lines 16-36
   *
   * If line 1 equals line 11, the IRS says to skip lines 16-36.
   * ------------------------------------------------------------
   */

  let line16 = 0;
  let line17 = 0;
  let line18 = 0;

  const line19 =
    thresholds.line19;

  let line20 = 0;
  let line21 = 0;
  let line22 = 0;
  let line23 = 0;
  let line24 = 0;
  let line25 = 0;
  let line26 = 0;
  let line27 = 0;
  let line28 = 0;
  let line29 = 0;
  let line30 = 0;
  let line31 = 0;
  let line32 = 0;
  let line33 = 0;
  let line34 = 0;
  let line35 = 0;
  let line36 = 0;

  if (line1 !== line11) {
    // Line 16
    line16 =
      Math.min(
        line1,
        line9
      );

    // Line 17
    line17 =
      line15;

    // Line 18
    line18 =
      Math.max(
        0,
        line16 - line17
      );

    // Line 20
    line20 =
      Math.min(
        line1,
        line19
      );

    // Line 21
    line21 =
      line14 + line15;

    // Line 22
    line22 =
      Math.max(
        0,
        line20 - line21
      );

    // Line 23
    line23 =
      Math.min(
        line18,
        line22
      );

    // Line 24
    line24 =
      line23 * 0.15;

    // Line 25
    line25 =
      line17 + line23;

    /*
     * If line 1 equals the sum of lines 21 and 23,
     * skip lines 26-36.
     */
    if (line1 !== line21 + line23) {
      // Line 26
      line26 =
        line16 - line25;

      // Line 27
      line27 =
        line26 * 0.20;

      // Line 28
      line28 =
        Math.min(
          line3,
          line6
        );

      // Line 29
      line29 =
        line4 + line14;

      // Line 30
      line30 =
        line1;

      // Line 31
      line31 =
        Math.max(
          0,
          line29 - line30
        );

      // Line 32
      line32 =
        Math.max(
          0,
          line28 - line31
        );

      // Line 33
      line33 =
        line32 * 0.25;

      /*
       * If line 5 is zero or blank,
       * skip lines 34-36.
       */
      if (line5 !== 0) {
        // Line 34
        line34 =
          line14 +
          line15 +
          line23 +
          line26 +
          line32;

        // Line 35
        line35 =
          line1 - line34;

        // Line 36
        line36 =
          line35 * 0.28;
      }
    }
  }


  /*
   * ------------------------------------------------------------
   * Line 37
   *
   * Ordinary income tax on line 14.
   * ------------------------------------------------------------
   */

  const line37 =
    taxRateSchedule2026(
      line14,
      filingStatus
    );


  /*
   * ------------------------------------------------------------
   * Line 38
   * ------------------------------------------------------------
   */

  const line38 =
    line24 +
    line27 +
    line33 +
    line36 +
    line37;


  /*
   * ------------------------------------------------------------
   * Line 39
   *
   * Ordinary income tax on all taxable income.
   * ------------------------------------------------------------
   */

  const line39 =
    taxRateSchedule2026(
      line1,
      filingStatus
    );


  /*
   * ------------------------------------------------------------
   * Line 40
   *
   * Smaller of line 38 or line 39.
   * ------------------------------------------------------------
   */

  const line40 =
    Math.min(
      line38,
      line39
    );


  return {
    tax: line40,

    lines: {
      1: line1,
      2: line2,
      3: line3,
      4: line4,
      5: line5,
      6: line6,
      7: line7,
      8: line8,
      9: line9,
      10: line10,
      11: line11,
      12: line12,

      "13a": line13a,
      "13b": line13b,
      "13c": line13c,

      14: line14,
      15: line15,
      16: line16,
      17: line17,
      18: line18,
      19: line19,
      20: line20,
      21: line21,
      22: line22,
      23: line23,
      24: line24,
      25: line25,
      26: line26,
      27: line27,
      28: line28,
      29: line29,
      30: line30,
      31: line31,
      32: line32,
      33: line33,
      34: line34,
      35: line35,
      36: line36,
      37: line37,
      38: line38,
      39: line39,
      40: line40
    }
  };
}


/**
 * 2026 ordinary income Tax Rate Schedules.
 *
 * Used by Worksheet 2-10:
 *
 *   line 37 - tax on line 14
 *   line 39 - tax on line 1
 */
function taxRateSchedule2026(
  income: number,
  filingStatus: FilingStatus
): number {
  income =
    Math.max(
      0,
      income
    );

  switch (filingStatus) {
    case FilingStatus.Single:
      if (income <= 12_400) {
        return income * 0.10;
      }

      if (income <= 50_400) {
        return (
          1_240 +
          (income - 12_400) * 0.12
        );
      }

      if (income <= 105_700) {
        return (
          5_800 +
          (income - 50_400) * 0.22
        );
      }

      if (income <= 201_775) {
        return (
          17_966 +
          (income - 105_700) * 0.24
        );
      }

      if (income <= 256_225) {
        return (
          41_024 +
          (income - 201_775) * 0.32
        );
      }

      if (income <= 640_600) {
        return (
          58_448 +
          (income - 256_225) * 0.35
        );
      }

      return (
        192_979.25 +
        (income - 640_600) * 0.37
      );


    case FilingStatus.HeadOfHousehold:
      if (income <= 17_700) {
        return income * 0.10;
      }

      if (income <= 67_450) {
        return (
          1_770 +
          (income - 17_700) * 0.12
        );
      }

      if (income <= 105_700) {
        return (
          7_740 +
          (income - 67_450) * 0.22
        );
      }

      if (income <= 201_750) {
        return (
          16_155 +
          (income - 105_700) * 0.24
        );
      }

      if (income <= 256_200) {
        return (
          39_207 +
          (income - 201_750) * 0.32
        );
      }

      if (income <= 640_600) {
        return (
          56_631 +
          (income - 256_200) * 0.35
        );
      }

      return (
        191_171 +
        (income - 640_600) * 0.37
      );


    case FilingStatus.MarriedFilingJointly:
    case FilingStatus.QualifyingSurvivingSpouse:
      if (income <= 24_800) {
        return income * 0.10;
      }

      if (income <= 100_800) {
        return (
          2_480 +
          (income - 24_800) * 0.12
        );
      }

      if (income <= 211_400) {
        return (
          11_600 +
          (income - 100_800) * 0.22
        );
      }

      if (income <= 403_550) {
        return (
          35_932 +
          (income - 211_400) * 0.24
        );
      }

      if (income <= 512_450) {
        return (
          82_048 +
          (income - 403_550) * 0.32
        );
      }

      if (income <= 768_700) {
        return (
          116_896 +
          (income - 512_450) * 0.35
        );
      }

      return (
        206_583.50 +
        (income - 768_700) * 0.37
      );


    case FilingStatus.MarriedFilingSeparate:
      if (income <= 12_400) {
        return income * 0.10;
      }

      if (income <= 50_400) {
        return (
          1_240 +
          (income - 12_400) * 0.12
        );
      }

      if (income <= 105_700) {
        return (
          5_800 +
          (income - 50_400) * 0.22
        );
      }

      if (income <= 201_775) {
        return (
          17_966 +
          (income - 105_700) * 0.24
        );
      }

      if (income <= 256_225) {
        return (
          41_024 +
          (income - 201_775) * 0.32
        );
      }

      if (income <= 384_350) {
        return (
          58_448 +
          (income - 256_225) * 0.35
        );
      }

      return (
        103_291.75 +
        (income - 384_350) * 0.37
      );
  }
}

interface Worksheet21Input {
  filingStatus: FilingStatus;

  /**
   * Line 1:
   * Expected 2026 adjusted gross income.
   *
   * If self-employed, this should already reflect the
   * deductible portion of self-employment tax.
   */
  adjustedGrossIncome: number;

  /**
   * Line 2a:
   *
   * Either:
   *   - expected itemized deductions, after any applicable
   *     Worksheet 2-5 / Worksheet 2-6 adjustments, or
   *   - standard deduction plus the permitted charitable
   *     contribution deduction.
   */
  deductions: number;

  /**
   * Line 2b:
   * Expected qualified business income deduction.
   */
  qualifiedBusinessIncomeDeduction?: number;

  /**
   * Line 2c:
   * Expected Schedule 1-A, line 38 additional deduction.
   */
  schedule1AAdditionalDeduction?: number;

  /**
   * Line 4:
   * Tax on line 3.
   *
   * This can come from:
   *   - the 2026 Tax Rate Schedules,
   *   - Worksheet 2-7 for qualified dividends/capital gains,
   *   - Worksheet 2-8 for foreign earned income/housing.
   *
   * If omitted, this function uses taxRateSchedule2026().
   */
  incomeTax?: number;

  /**
   * Line 5:
   * Expected alternative minimum tax from Form 6251.
   */
  alternativeMinimumTax?: number;

  /**
   * Other taxes that the Worksheet 2-1 instructions say
   * should be added on line 6, such as applicable taxes
   * from Forms 8814 or 4972 and certain credit recaptures.
   */
  line6OtherTaxes?: number;

  /**
   * Line 7:
   * Expected nonrefundable credits.
   *
   * Do not include income tax withholding here.
   */
  credits?: number;

  /**
   * Line 9:
   * Expected self-employment tax.
   */
  selfEmploymentTax?: number;

  /**
   * Line 10:
   * Other taxes, including applicable Additional Medicare
   * Tax, NIIT, and other taxes covered by the instructions.
   */
  otherTaxes?: number;

  /**
   * Line 11b:
   *
   * Expected:
   *   - earned income credit
   *   - additional child tax credit
   *   - fuel tax credit
   *   - net premium tax credit
   *   - refundable American opportunity credit
   *   - refundable adoption credit
   *   - section 1341 credit
   */
  refundableCredits?: number;

  /**
   * Used for line 12a.
   *
   * Set true if at least two-thirds of gross income for
   * 2025 or 2026 is from farming or fishing.
   */
  farmingOrFishing?: boolean;

  /**
   * Prior-year AGI used to determine whether the
   * 110% safe-harbor rule applies.
   */
  priorYearAdjustedGrossIncome: number;

  /**
   * Prior-year total tax for purposes of Worksheet 2-1
   * line 12b.
   *
   * This should already be calculated according to the
   * Publication 505 definition of prior-year total tax.
   */
  priorYearTotalTax: number;

  /**
   * Whether the prior-year return covered a full
   * 12-month tax year.
   *
   * Normally must be true to use the prior-year safe harbor.
   */
  priorYearWasFull12Months?: boolean;

  /**
   * Line 13:
   * Expected 2026 income tax withholding.
   *
   * Includes applicable withholding from wages,
   * pensions, annuities, Additional Medicare Tax, etc.
   */
  expectedWithholding?: number;

  /**
   * Used for line 15.
   *
   * Any 2025 overpayment being applied to the
   * April 15, 2026 installment.
   */
  priorYearOverpaymentAppliedToFirstInstallment?: number;

  /**
   * Optional section 1062 adjustment.
   *
   * If a valid section 1062 election applies, supply the
   * amount by which the normal current-year amount used
   * in determining the required annual payment should
   * be reduced.
   *
   * Normally 0.
   */
  section1062DeferredTaxAdjustment?: number;
}


interface Worksheet21Lines {
  1: number;
  "2a": number;
  "2b": number;
  "2c": number;
  "2d": number;
  3: number;
  4: number;
  5: number;
  6: number;
  7: number;
  8: number;
  9: number;
  10: number;
  "11a": number;
  "11b": number;
  "11c": number;
  "12a": number;
  "12b": number;
  "12c": number;
  13: number;
  "14a": number;
  "14b": number;
  15: number;
}


export interface Worksheet21Result {
  lines: Worksheet21Lines;

  /**
   * True if Worksheet 2-1 indicates that estimated
   * tax payments are required.
   */
  estimatedTaxPaymentsRequired: boolean;

  /**
   * The first installment from line 15.
   *
   * Zero when estimated payments aren't required.
   */
  firstInstallment: number;

  /**
   * Explains why estimated payments aren't required,
   * when applicable.
   */
  stopReason?: "WITHHOLDING_COVERS_REQUIRED_PAYMENT" | "BALANCE_LESS_THAN_1000";
}


/**
 * IRS Publication 505 (2026)
 * Worksheet 2-1
 *
 * 2026 Estimated Tax Worksheet
 */
export function worksheet2_1_2026(
  input: Worksheet21Input
): Worksheet21Result {
  const {
    filingStatus,
    adjustedGrossIncome,
    deductions,
    qualifiedBusinessIncomeDeduction = 0,
    schedule1AAdditionalDeduction = 0,
    alternativeMinimumTax = 0,
    line6OtherTaxes = 0,
    credits = 0,
    selfEmploymentTax = 0,
    otherTaxes = 0,
    refundableCredits = 0,
    farmingOrFishing = false,
    priorYearAdjustedGrossIncome,
    priorYearTotalTax,
    priorYearWasFull12Months = true,
    expectedWithholding = 0,
    priorYearOverpaymentAppliedToFirstInstallment = 0,
    section1062DeferredTaxAdjustment = 0
  } = input;

  /*
   * ------------------------------------------------------------
   * Line 1
   * Expected adjusted gross income
   * ------------------------------------------------------------
   */

  const line1 =
    adjustedGrossIncome;


  /*
   * ------------------------------------------------------------
   * Lines 2a-2d
   * Deductions
   * ------------------------------------------------------------
   */

  // Line 2a
  const line2a =
    deductions;

  // Line 2b
  const line2b =
    qualifiedBusinessIncomeDeduction;

  // Line 2c
  const line2c =
    schedule1AAdditionalDeduction;

  // Line 2d
  const line2d =
    line2a +
    line2b +
    line2c;


  /*
   * ------------------------------------------------------------
   * Line 3
   * Taxable income
   * ------------------------------------------------------------
   */

  const line3 =
    Math.max(
      0,
      line1 - line2d
    );


  /*
   * ------------------------------------------------------------
   * Line 4
   * Income tax
   *
   * If the caller supplies incomeTax, use it.
   *
   * Otherwise, calculate ordinary income tax from the
   * 2026 Tax Rate Schedules.
   *
   * The caller should supply incomeTax when Worksheet 2-7
   * or Worksheet 2-8 is required.
   * ------------------------------------------------------------
   */

  const line4 =
    input.incomeTax ??
    taxRateSchedule2026(
      line3,
      filingStatus
    );


  /*
   * ------------------------------------------------------------
   * Line 5
   * Alternative minimum tax
   * ------------------------------------------------------------
   */

  const line5 =
    alternativeMinimumTax;


  /*
   * ------------------------------------------------------------
   * Line 6
   *
   * Line 4 + line 5 + applicable other taxes that belong
   * on this worksheet line.
   * ------------------------------------------------------------
   */

  const line6 =
    line4 +
    line5 +
    line6OtherTaxes;


  /*
   * ------------------------------------------------------------
   * Line 7
   * Credits
   * ------------------------------------------------------------
   */

  const line7 =
    credits;


  /*
   * ------------------------------------------------------------
   * Line 8
   *
   * Line 6 - line 7.
   * Zero if negative.
   * ------------------------------------------------------------
   */

  const line8 =
    Math.max(
      0,
      line6 - line7
    );


  /*
   * ------------------------------------------------------------
   * Line 9
   * Self-employment tax
   * ------------------------------------------------------------
   */

  const line9 =
    selfEmploymentTax;


  /*
   * ------------------------------------------------------------
   * Line 10
   * Other taxes
   * ------------------------------------------------------------
   */

  const line10 =
    otherTaxes;


  /*
   * ------------------------------------------------------------
   * Line 11a
   *
   * Add lines 8 through 10.
   * ------------------------------------------------------------
   */

  const line11a =
    line8 +
    line9 +
    line10;


  /*
   * ------------------------------------------------------------
   * Line 11b
   * Refundable credits
   * ------------------------------------------------------------
   */

  const line11b =
    refundableCredits;


  /*
   * ------------------------------------------------------------
   * Line 11c
   *
   * Total estimated 2026 tax.
   * ------------------------------------------------------------
   */

  const line11c =
    Math.max(
      0,
      line11a - line11b
    );


  /*
   * ------------------------------------------------------------
   * Line 12a
   *
   * Normally:
   *   90% of expected 2026 tax
   *
   * Farming/fishing:
   *   66 2/3%, represented on the worksheet as 0.6667
   *
   * The optional section 1062 adjustment is applied before
   * the percentage calculation when applicable.
   * ------------------------------------------------------------
   */

  const currentYearRequiredPaymentBase =
    Math.max(
      0,
      line11c - section1062DeferredTaxAdjustment
    );

  const currentYearPercentage =
    farmingOrFishing
      ? 0.6667
      : 0.90;

  const line12a =
    currentYearRequiredPaymentBase *
    currentYearPercentage;


  /*
   * ------------------------------------------------------------
   * Line 12b
   * Required annual payment based on prior year's tax
   *
   * Normally:
   *   100% of prior-year tax
   *
   * Higher-income taxpayers:
   *   110% of prior-year tax
   *
   * The 110% rule does not apply to qualifying
   * farming/fishing taxpayers.
   * ------------------------------------------------------------
   */

  const highIncomeThreshold =
    filingStatus === FilingStatus.MarriedFilingSeparate
      ? 75_000
      : 150_000;

  const isHigherIncomeTaxpayer =
    !farmingOrFishing &&
    priorYearAdjustedGrossIncome > highIncomeThreshold;

  const priorYearPercentage =
    isHigherIncomeTaxpayer
      ? 1.10
      : 1.00;

  /*
   * Publication 505 generally requires the prior-year
   * return to cover a full 12 months to use this safe harbor.
   *
   * If not, there isn't a usable line 12b prior-year
   * safe-harbor amount, so Infinity causes line 12c to
   * select line 12a.
   */
  const line12b =
    priorYearWasFull12Months
      ? priorYearTotalTax * priorYearPercentage
      : Number.POSITIVE_INFINITY;


  /*
   * ------------------------------------------------------------
   * Line 12c
   *
   * Smaller of lines 12a and 12b.
   * ------------------------------------------------------------
   */

  const line12c =
    Math.min(
      line12a,
      line12b
    );


  /*
   * ------------------------------------------------------------
   * Line 13
   * Expected withholding
   * ------------------------------------------------------------
   */

  const line13 =
    expectedWithholding;


  /*
   * ------------------------------------------------------------
   * Line 14a
   *
   * Line 12c - line 13.
   * ------------------------------------------------------------
   */

  const line14a =
    line12c - line13;


  /*
   * If line 14a is zero or less:
   *
   * Stop. No estimated tax payments are required.
   * ------------------------------------------------------------
   */

  if (line14a <= 0) {
    return {
      estimatedTaxPaymentsRequired: false,
      firstInstallment: 0,
      stopReason: "WITHHOLDING_COVERS_REQUIRED_PAYMENT",

      lines: {
        1: line1,
        "2a": line2a,
        "2b": line2b,
        "2c": line2c,
        "2d": line2d,
        3: line3,
        4: line4,
        5: line5,
        6: line6,
        7: line7,
        8: line8,
        9: line9,
        10: line10,
        "11a": line11a,
        "11b": line11b,
        "11c": line11c,
        "12a": line12a,
        "12b": line12b,
        "12c": line12c,
        13: line13,
        "14a": line14a,
        "14b": line11c - line13,
        15: 0
      }
    };
  }


  /*
   * ------------------------------------------------------------
   * Line 14b
   *
   * Line 11c - line 13.
   * ------------------------------------------------------------
   */

  const line14b =
    line11c - line13;


  /*
   * If line 14b is less than $1,000:
   *
   * Stop. No estimated tax payments are required.
   * ------------------------------------------------------------
   */

  if (line14b < 1_000) {
    return {
      estimatedTaxPaymentsRequired: false,
      firstInstallment: 0,
      stopReason: "BALANCE_LESS_THAN_1000",

      lines: {
        1: line1,
        "2a": line2a,
        "2b": line2b,
        "2c": line2c,
        "2d": line2d,
        3: line3,
        4: line4,
        5: line5,
        6: line6,
        7: line7,
        8: line8,
        9: line9,
        10: line10,
        "11a": line11a,
        "11b": line11b,
        "11c": line11c,
        "12a": line12a,
        "12b": line12b,
        "12c": line12c,
        13: line13,
        "14a": line14a,
        "14b": line14b,
        15: 0
      }
    };
  }


  /*
   * ------------------------------------------------------------
   * Line 15
   *
   * If the first required payment is due April 15, 2026:
   *
   *   1/4 × line 14a
   *
   * minus any 2025 overpayment applied to this installment.
   * ------------------------------------------------------------
   */

  const line15 =
    Math.max(
      0,
      line14a / 4 -
      priorYearOverpaymentAppliedToFirstInstallment
    );


  return {
    estimatedTaxPaymentsRequired: true,
    firstInstallment: line15,

    lines: {
      1: line1,
      "2a": line2a,
      "2b": line2b,
      "2c": line2c,
      "2d": line2d,
      3: line3,
      4: line4,
      5: line5,
      6: line6,
      7: line7,
      8: line8,
      9: line9,
      10: line10,
      "11a": line11a,
      "11b": line11b,
      "11c": line11c,
      "12a": line12a,
      "12b": line12b,
      "12c": line12c,
      13: line13,
      "14a": line14a,
      "14b": line14b,
      15: line15
    }
  };
}
