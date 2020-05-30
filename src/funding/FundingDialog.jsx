/* eslint-disable jsx-a11y/control-has-associated-label */
/* eslint-disable jsx-a11y/label-has-associated-control */
import 'regenerator-runtime/runtime';
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Field, ErrorMessage } from 'formik';
import { ModalDialog } from '../Modal';
import Funding from './Funding';
import Amount from '../Amount';

const mapStateToProps = (state) => {
    const { systemGroupId, fundingPoolId } = state.categoryTree;
    let fundingAmount = 0;

    const system = state.categoryTree.groups.find((g) => g.id === systemGroupId);

    if (system) {
        const fundingPool = system.categories.find((c) => c.id === fundingPoolId);

        if (fundingPool) {
            fundingAmount = fundingPool.amount;
        }
    }

    return {
        fundingPoolId,
        fundingAmount,
    };
};

const FundingDialog = connect(mapStateToProps)(({ transaction, ...props }) => {
    const [plansInitialized, setPlansInitialized] = useState(false);
    const [groupsInitialized, setGroupsInitialized] = useState(false);
    const [plans, setPlans] = useState([]);
    const [selectedPlan, setSelectedPlan] = useState(-1);
    const [funding, setFunding] = useState(
        transaction
            ? { planId: -1, categories: transaction.categories }
            : { planId: -1, categories: [] },
    );
    const [groups, setGroups] = useState([]);

    const {
        onClose,
        onExited,
        title,
        show,
        fundingPoolId,
        fundingAmount,
    } = props;

    if (!plansInitialized) {
        setPlansInitialized(true);

        fetch('/funding_plans')
            .then(
                async (response) => setPlans(await response.json()),
            );
    }

    const handlePlanChange = (event, resetForm, values) => {
        const { value } = event.target;
        setSelectedPlan(value);
        fetch(`/funding_plan/${event.target.value}`)
            .then(
                async (response) => {
                    const json = await response.json();
                    const newFunding = { planId: value, categories: json.categories };
                    setFunding(newFunding);
                    resetForm({ values: { ...values, funding: newFunding } });
                },
            );
    };

    if (!groupsInitialized) {
        setGroupsInitialized(true);

        fetch('/groups')
            .then(
                (response) => response.json(),
            )
            .then(
                (json) => (setGroups(json)),
            );
    }

    const populatePlans = () => {
        const planOptions = [(<option key={-1} value={-1}>None</option>)];

        plans.forEach(({ id, name }) => {
            planOptions.push(<option key={id} value={id}>{name}</option>);
        });

        return planOptions;
    };

    const handleDeltaChange = () => {
    };

    const handleSubmit = (values) => {
        const request = { date: values.date };
        request.categories = values.funding.filter((item) => (
            item.amount !== 0
        ))
            .map((item) => ({
                categoryId: item.categoryId,
                amount: item.amount,
            }));

        const sum = request.categories.reduce((accumulator, item) => (
            accumulator + item.amount
        ), 0);

        request.categories.push({ categoryId: fundingPoolId, amount: -sum });

        fetch('category_transfer', {
            method: 'post',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        })
            .then(() => {
                onClose();
            });
    };

    const handleValidate = (values) => {
        const errors = {};

        if (values.date === '') {
            errors.date = 'A date must be specified.';
        }

        // Verify that there is at least one non-zero funding item.
        let count = 0;

        values.funding.forEach((item) => {
            if (item.amount !== 0) {
                count += 1;
            }
        });

        if (count === 0) {
            errors.funding = 'At least one non-zero funding item must be entered.';
        }

        return errors;
    };

    return (
        <ModalDialog
            initialValues={{
                date: transaction ? transaction.date : '',
                funding,
            }}
            validate={handleValidate}
            onSubmit={handleSubmit}
            show={show}
            onClose={onClose}
            onExited={onExited}
            title={title}
            size="lg"
            scrollable
            form={() => (
                <>
                    <div className="funding-header">
                        <label>
                            Plan
                            <Field name="plans">
                                {({ form: { resetForm, values } }) => (
                                    <select
                                        value={selectedPlan}
                                        onChange={(event) => (
                                            handlePlanChange(event, resetForm, values)
                                        )}
                                    >
                                        {populatePlans()}
                                    </select>
                                )}
                            </Field>
                        </label>
                        <label>
                            Date
                            <Field type="date" name="date" />
                        </label>
                        <label>
                            Available Funds
                            <Amount amount={fundingAmount} />
                        </label>
                    </div>
                    <ErrorMessage name="date" />
                    <div className="cat-fund-table">
                        <div className="fund-list-item cat-fund-title">
                            <div className="fund-list-cat-name">Category</div>
                            <div className="dollar-amount fund-list-amt">Current</div>
                            <div className="dollar-amount">Funding</div>
                            <div className="dollar-amount fund-list-amt">Balance</div>
                        </div>
                        <Field name="funding">
                            {({ field: { name, value }, form: { setFieldValue } }) => (
                                <Funding
                                    key={funding.planId}
                                    groups={groups}
                                    plan={value}
                                    onDeltaChange={(_amount, delta, newFunding) => {
                                        handleDeltaChange(delta);
                                        setFieldValue(name, newFunding, false);
                                    }}
                                />
                            )}
                        </Field>
                        <ErrorMessage name="funding" />
                    </div>
                </>
            )}
        />
    );
});

FundingDialog.propTypes = {
    onClose: PropTypes.func.isRequired,
    onExited: PropTypes.func.isRequired,
    title: PropTypes.string,
    show: PropTypes.bool.isRequired,
    fundingPoolId: PropTypes.number.isRequired,
    fundingAmount: PropTypes.number.isRequired,
    transaction: PropTypes.shape(),
};

FundingDialog.defaultProps = {
    title: 'Fund Categories',
    transaction: null,
};

export default FundingDialog;
