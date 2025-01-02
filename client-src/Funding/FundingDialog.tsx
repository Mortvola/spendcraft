import React from 'react';
import {
  Field, FieldProps,
  FormikErrors, FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import { DateTime } from 'luxon';
import Http from '@mortvola/http';
import Amount from '../Amount';
import { useStores } from '../State/Store';
import {
  TransactionType, CategoryFundingProps,
  ApiResponse,
  ProposedFundingCategoryProps,
  CategoryType,
} from '../../common/ResponseTypes';
import Funding from './Funding';
import {
  CategoriesValueType,
  FundingType, ValueType,
} from './Types'
import styles from './Funding.module.scss'
import { isGroup } from '../State/Group';
import { isCategory } from '../State/Category';
import { TransactionInterface } from '../State/Types';
import { CategorySpreadEntry } from '../CategorySpread/CategorySpread';

type PropsType = {
  transaction?: TransactionInterface;
}

const FundingDialog: React.FC<PropsType & ModalProps> = ({
  transaction,
  setShow,
}) => {
  const { categoryTree, register } = useStores();
  const { budget: { fundingPoolCat } } = categoryTree;

  if (!fundingPoolCat) {
    throw new Error('funding pool is unassigned');
  }

  const [diffOnly, setDiffOnly] = React.useState<boolean>(false);

  const computeSpread = (amount: number, fundingCategories: CategorySpreadEntry[]): Map<number, number> => {
    let categoryAmount = Math.round(amount * 100);
    let percentSum = 0;

    // Sort the funding categories by percentage so that fixed amounts are applied before percentage amounts.
    const sortedCategories = (fundingCategories ?? []).slice().sort((a) => (a.percentage ? 1 : -1))

    const funders: Map<number, number> = new Map();

    // eslint-disable-next-line no-restricted-syntax
    // for (const fundingCategory of sortedCategories) {
    for (let i = 0; i < sortedCategories.length; i += 1) {
      const fundingCategory = sortedCategories[i];
      const funding = funders.get(fundingCategory.categoryId) ?? 0;
      let fundingAmount: number;

      if (fundingCategory.percentage) {
        fundingAmount = Math.round((fundingCategory.amount / 100.0) * categoryAmount);
        percentSum += fundingAmount;

        // If we are on the last item and there is a remaing amount (due to rounding error)
        // then add it to the last funding amount.
        if (i === sortedCategories.length - 1 && percentSum !== categoryAmount) {
          fundingAmount += percentSum - categoryAmount;
        }
      }
      else {
        fundingAmount = Math.round(fundingCategory.amount * 100);

        // Don't take more than what is left in the category amount
        if (categoryAmount < fundingAmount) {
          fundingAmount = categoryAmount
        }

        categoryAmount -= fundingAmount;
      }

      if (fundingAmount !== 0) {
        funders.set(fundingCategory.categoryId, funding + fundingAmount)
        // fundingCategory.fundedAmount = fundingAmount / 100;
      }
    }

    return funders;
  }

  const getCategoriesSum = (categories: CategoriesValueType, fundingCatId: number) => {
    let sum = 0;

    // eslint-disable-next-line no-restricted-syntax
    for (const k of Object.keys(categories)) {
      const categoryId = parseInt(k, 10)

      if (categoryId !== fundingCatId) {
        const cat = categories[k]

        if (cat.fundingCategories.some((fc) => fc.categoryId === fundingCatId)) {
          // At least one funding category matches the one we are looking for
          // Get the total amount by adding the base amount to the amounts for
          // each category that uses this category as a funding source.
          let sum2 = typeof cat.baseAmount === 'string' ? parseFloat(cat.baseAmount) : cat.baseAmount;
          if (cat.includeFundingTransfers) {
            const fundingTransfers = getCategoriesSum(categories, categoryId)

            sum2 += fundingTransfers
          }

          const funders = computeSpread(sum2, cat.fundingCategories)
          const funderAmount = funders.get(fundingCatId)

          if (funderAmount !== undefined) {
            sum += funderAmount / 100.0
          }
        }
      }
    }

    return sum;
  }

  const handleSubmit = async (values: ValueType) => {
    type Request = {
      date: string,
      categories: CategoryFundingProps[],
    }

    const categories: CategoryFundingProps[] = Object.keys(values.categories)
      .filter((k) => parseInt(k, 10) !== fundingPoolCat.id)
      .map((k) => {
        const categoryId = parseInt(k, 10);

        const baseAmount = typeof values.categories[k].baseAmount === 'string'
          ? parseFloat(values.categories[k].baseAmount)
          : values.categories[k].baseAmount;

        const amount = baseAmount

        return {
          categoryId,
          amount,
          fundingCategories: values.categories[k].fundingCategories,
          includeFundingTransfers: values.categories[k].includeFundingTransfers,
          baseAmount,
        }
      })

    const funders: Map<number, number> = new Map();

    // eslint-disable-next-line no-restricted-syntax
    for (const category of categories) {
      const categoryFunders = computeSpread(category.amount, category.fundingCategories);

      // eslint-disable-next-line no-restricted-syntax
      for (const [categoryId, amount] of categoryFunders) {
        const funding = funders.get(categoryId) ?? 0;
        funders.set(categoryId, funding + amount)
      }
    }

    // Adjust amounts for categories that have "include funding transfers" set to true.
    // eslint-disable-next-line no-restricted-syntax
    for (const category of categories) {
      if (category.includeFundingTransfers) {
        const previousFundingAmount = computeSpread(category.amount, category.fundingCategories);

        // eslint-disable-next-line no-restricted-syntax
        for (const [categoryId, amount] of previousFundingAmount) {
          const funding = funders.get(categoryId) ?? 0;
          funders.set(categoryId, funding - amount)
        }

        // Find funder that matches this category and add the amount.
        let sum = 0;
        // eslint-disable-next-line no-restricted-syntax
        for (const [categoryId, amount] of funders) {
          if (categoryId === category.categoryId) {
            sum += amount;
          }
        }

        category.amount += sum / 100.0;

        const newFundingAmount = computeSpread(category.amount, category.fundingCategories);

        // eslint-disable-next-line no-restricted-syntax
        for (const [categoryId, amount] of newFundingAmount) {
          const funding = funders.get(categoryId) ?? 0;
          funders.set(categoryId, funding + amount)
        }
      }
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const [categoryId, amount] of funders) {
      categories.push({
        categoryId,
        amount: -amount / 100.0,
        baseAmount: 0,
        funder: true,
        fundingCategories: [],
        includeFundingTransfers: false,
      });
    }

    const request: Request = {
      date: values.date,
      categories,
    };

    let errors: Error[] | null;
    if (transaction) {
      errors = await transaction.updateCategoryTransfer(request);
    }
    else {
      errors = await register.addCategoryTransfer(request, TransactionType.FUNDING_TRANSACTION);
    }

    if (!errors) {
      setShow(false);
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.date === '') {
      errors.date = 'A date must be specified.';
    }

    // Verify that there is at least one non-zero funding item.
    let count = 0;

    Object.keys(values.categories).forEach((k) => {
      const value = values.categories[k];
      const newValue = typeof value === 'string' ? parseFloat(value) : value;

      if (newValue !== 0) {
        count += 1;
      }
    });

    if (count === 0) { //  && errors.funding) {
      console.log('At least one non-zero funding item must be entered.');
    }

    return errors;
  };

  const handleDelete = async (context: FormikContextType<ValueType>) => {
    const { setTouched, setErrors } = context;

    if (transaction) {
      const errors = await transaction.delete();

      if (errors) {
        setTouched({ [errors[0].field]: true }, false);
        setFormErrors(setErrors, errors);
      }
      else {
        setShow(false)
      }
    }
  }

  const initialFundingDate = React.useCallback(() => (
    (transaction
      ? transaction.date
      : DateTime.now().startOf('month')
    ).toISODate()
  ), [transaction]);

  const initialFunding = (): CategoriesValueType | undefined => {
    if (transaction) {
      const obj: CategoriesValueType = {}

      transaction.categories.forEach((c) => {
        if (!c.funder) {
          let { fundingCategories } = c;

          if (fundingCategories === undefined) {
            const category = categoryTree.getCategory(c.categoryId)

            if (!category) {
              throw new Error(`category not found: ${c.categoryId}`)
            }

            fundingCategories = [{
              categoryId: category.getFundingPool().id,
              amount: 100,
              percentage: true,
            }]
          }

          obj[c.categoryId] = {
            baseAmount: c.baseAmount ?? c.amount,
            fundingCategories,
            includeFundingTransfers: c.includeFundingTransfers ?? false,
          }
        }
      })

      // Add to the transaction any category that is not yet represented
      categoryTree.budget.children.forEach((node) => {
        if (isGroup(node)) {
          if (node.id !== categoryTree.systemIds.systemGroupId) {
            node.children.forEach((cat) => {
              if (obj[cat.id] === undefined) {
                obj[cat.id] = {
                  baseAmount: 0,
                  fundingCategories: [{
                    categoryId: cat.getFundingPool().id,
                    amount: 100,
                    percentage: true,
                  }],
                  includeFundingTransfers: false,
                }
              }
            })
          }
        }
        else if (isCategory(node)) {
          if (obj[node.id] === undefined) {
            obj[node.id] = {
              baseAmount: 0,
              fundingCategories: [{
                categoryId: node.getFundingPool().id,
                amount: 100,
                percentage: true,
              }],
              includeFundingTransfers: false,
            }
          }
        }
      })

      return obj;
    }

    return undefined;
  }

  const [categories, setCategories] = React.useState<CategoriesValueType | undefined>(initialFunding())

  const handleCheckChange = () => {
    setDiffOnly((prev) => (!prev));
  }

  const getProposed = React.useCallback(async (date: string) => {
    const response = await Http.get<ApiResponse<ProposedFundingCategoryProps[]>>(
      `/api/v1/funding-plans/proposed?date=${date}`,
    );

    if (response.ok) {
      const { data } = (await response.body());

      if (data) {
        const obj: CategoriesValueType = {};

        data.forEach((cat) => {
          const category = categoryTree.getCategory(cat.categoryId)

          if (category && ![CategoryType.AccountTransfer, CategoryType.Unassigned].includes(category.type)) {
            obj[cat.categoryId] = {
              baseAmount: cat.amount,
              fundingCategories: [],
              includeFundingTransfers: cat.includeFundingTransfers,
            }

            let fundingCats = cat.fundingCategories;

            if (fundingCats.length === 0) {
              const fundingPool = category.getFundingPool()

              fundingCats = [{
                categoryId: fundingPool.id,
                amount: 100.0,
                percentage: true,
              }];
            }

            for (let i = 0; i < fundingCats.length; i += 1) {
              obj[cat.categoryId].fundingCategories.push({
                categoryId: fundingCats[i].categoryId,
                amount: fundingCats[i].amount,
                percentage: fundingCats[i].percentage,
              });
            }
          }
        })

        return obj
      }
    }

    return null;
  }, [categoryTree]);

  React.useEffect(() => {
    (async () => {
      if (!transaction) {
        const date = DateTime.fromISO(
          initialFundingDate() ?? DateTime.now().toISODate(),
        ).startOf('month').toISODate() ?? '';

        const obj = await getProposed(date)

        if (obj) {
          setCategories(obj)
        }
      }
    })();
  }, [getProposed, initialFundingDate, transaction]);

  if (!categories) {
    return null;
  }

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        date: initialFundingDate() ?? '',
        categories,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Fund Categories"
      formId="fundingDialogForm"
      onDelete={transaction ? handleDelete : null}
    >
      <div className="fund-container">
        <div className="funding-header">
          <label>
            Date:
            <Field name="date">
              {
                ({ field, form }: FieldProps) => (
                  <input
                    {...field}
                    type="date"
                    className="form-control"
                    onChange={(event) => {
                      if (!transaction) {
                        (async () => {
                          const obj = await getProposed(event.target.value)

                          if (obj) {
                            // eslint-disable-next-line no-restricted-syntax
                            for (const [categoryId, value] of Object.entries(obj)) {
                              form.setFieldValue(`categories.${categoryId}.baseAmount`, value.baseAmount)
                            }
                          }
                        })()
                      }
                      field.onChange(event)
                    }}
                  />
                )
              }
            </Field>
          </label>
          <FormError name="date" />
          <label>
            Available Funds:
            <Field>
              {
                ({ form: { values } }: FieldProps<FundingType[]>) => (
                  <Amount
                    className="form-control"
                    amount={fundingPoolCat.balance - getCategoriesSum(values.categories, fundingPoolCat.id)}
                  />
                )
              }
            </Field>
          </label>
        </div>
        <label>
          <input type="checkbox" checked={diffOnly} onChange={handleCheckChange} className={styles.checkbox} />
          Show only differences in funding
        </label>
        <div className="cat-fund-table">
          <Field>
            {({
              form: {
                values,
              },
            }: FieldProps<FundingType[]>) => (
              <Funding
                date={DateTime.fromISO(values.date).startOf('month').toISODate() ?? ''}
                diffOnly={diffOnly}
              />
            )}
          </Field>
          <FormError name="funding" />
        </div>
        <div className={`${styles.fundListItem} ${styles.catFundTitle}`}>
          <div className={styles.fundListCatName} />
          <div className={styles.labeledAmount}>
            Total
            <Field>
              {
                ({ form: { values } }: FieldProps<FundingType[]>) => (
                  <Amount
                    style={{ minWidth: '6rem' }}
                    amount={getCategoriesSum(values.categories, fundingPoolCat.id)}
                  />
                )
              }
            </Field>
          </div>
          <div className={`dollar-amount ${styles.fundListAmt}`} />
        </div>
      </div>
    </FormModal>
  );
};

export const useFundingDialog = makeUseModal<PropsType>(FundingDialog);

export default FundingDialog;
