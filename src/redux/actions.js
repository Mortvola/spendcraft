import {
    ADD_GROUP,
    UPDATE_GROUP,
    DELETE_GROUP,
    REQUEST_GROUPS,
    RECEIVE_GROUPS,
    ADD_CATEGORY,
    UPDATE_CATEGORY,
    DELETE_CATEGORY,
    REQUEST_TRANSACTIONS,
    RECEIVE_TRANSACTIONS,
    REQUEST_INSTITUTIONS,
    RECEIVE_INSTITUTIONS,
    RECEIVE_CATEGORY_BALANCES,
    RECEIVE_TRANSACTION_CATEGORIES,
    SELECT_CATEGORY,
    SELECT_ACCOUNT,
    RECEIVE_SYSTEM_IDS,
    RECEIVE_ACCOUNT_BALANCES,
} from './actionTypes';

const addGroup = (group) => ({
    type: ADD_GROUP,
    group,
});

const updateGroup = (group) => ({
    type: UPDATE_GROUP,
    group,
});

const deleteGroup = (group) => ({
    type: DELETE_GROUP,
    group,
});

const requestGroups = () => ({
    type: REQUEST_GROUPS,
});

const receieveGroups = (groups) => ({
    type: RECEIVE_GROUPS,
    groups,
});

const receiveSystemIds = (systemIds) => ({
    type: RECEIVE_SYSTEM_IDS,
    ...systemIds,
});

const requestTransactions = () => ({
    type: REQUEST_TRANSACTIONS,
});

const receiveTransactions = (categoryId, transactions) => ({
    type: RECEIVE_TRANSACTIONS,
    categoryId,
    transactions,
});

const receiveAccountBalances = (balances) => ({
    type: RECEIVE_ACCOUNT_BALANCES,
    balances,
});

const setCategorySelection = (categoryId) => ({
    type: SELECT_CATEGORY,
    categoryId,
});

const selectCategory = (categoryId) => (
    (dispatch) => {
        dispatch(setCategorySelection(categoryId));
        dispatch(requestTransactions());

        return (
            fetch(`/category/${categoryId}/transactions`)
                .then(
                    (response) => response.json(),
                    (error) => console.log('fetch error: ', error),
                )
                .then(
                    (json) => {
                        json.transactions.sort((a, b) => {
                            if (a.date < b.date) {
                                return 1;
                            }

                            if (a.date > b.date) {
                                return -1;
                            }

                            if (a.sort_order < b.sort_order) {
                                return 1;
                            }

                            if (a.sort_order > b.sort_order) {
                                return -1;
                            }

                            return 0;
                        });

                        return dispatch(receiveTransactions(categoryId, json));
                    },
                )
        );
    }
);

const setAccountSelection = (accountId, tracking) => ({
    type: SELECT_ACCOUNT,
    accountId,
    tracking,
});

const selectAccount = (accountId, tracking) => (
    (dispatch) => {
        dispatch(setAccountSelection(accountId, tracking));
        dispatch(requestTransactions());

        if (tracking === 'Transactions') {
            return (
                fetch(`/account/${accountId}/transactions`)
                    .then(
                        (response) => response.json(),
                        (error) => console.log('fetch error: ', error),
                    )
                    .then(
                        (json) => {
                            json.transactions.sort((a, b) => {
                                if (a.date < b.date) {
                                    return 1;
                                }

                                if (a.date > b.date) {
                                    return -1;
                                }

                                if (a.sort_order < b.sort_order) {
                                    return 1;
                                }

                                if (a.sort_order > b.sort_order) {
                                    return -1;
                                }

                                return 0;
                            });

                            return dispatch(receiveTransactions(null, json));
                        },
                    )
            );
        }

        return (
            fetch(`/account/${accountId}/balances`)
                .then(
                    (response) => response.json(),
                    (error) => console.log('fetch error: ', error),
                )
                .then(
                    (json) => dispatch(receiveAccountBalances(json)),
                )
        );
    }
);

const fetchGroups = () => (
    (dispatch, getState) => {
        dispatch(requestGroups());

        return (
            fetch('/groups')
                .then(
                    (response) => response.json(),
                    (error) => console.log('fetch error: ', error),
                )
                .then(
                    (json) => {
                        const systemGroup = json.find((g) => g.system);

                        const systemIds = {
                            systemId: systemGroup.id,
                            unassignedId: systemGroup.categories.find((c) => c.system && c.name === 'Unassigned').id,
                            fundingPoolId: systemGroup.categories.find((c) => c.system && c.name === 'Funding Pool').id,
                        };

                        dispatch(receiveSystemIds(systemIds));
                        dispatch(receieveGroups(json));

                        // If nothing is currently selected then select the unassigned category.
                        const state = getState();
                        if (state.selections.selectedCategoryId === null
                            && state.selections.selectedAccountId === null) {
                            dispatch(selectCategory(systemIds.unassignedId));
                        }
                    },
                )
        );
    }
);

const addCategory = (category) => ({
    type: ADD_CATEGORY,
    category,
});

const updateCategory = (category) => ({
    type: UPDATE_CATEGORY,
    category,
});

const deleteCategory = (category) => ({
    type: DELETE_CATEGORY,
    category,
});

const requestInstitutions = () => ({
    type: REQUEST_INSTITUTIONS,
});

const receiveInstitutions = (institutions) => ({
    type: RECEIVE_INSTITUTIONS,
    institutions,
});

const fetchInstitutions = () => (
    (dispatch) => {
        dispatch(requestInstitutions());

        return (
            fetch('/connected_accounts')
                .then(
                    (response) => response.json(),
                    (error) => console.log('fetch error: ', error),
                )
                .then(
                    (json) => dispatch(receiveInstitutions(json)),
                )
        );
    }
);

const receiveCategoryBalances = (balances) => ({
    type: RECEIVE_CATEGORY_BALANCES,
    balances,
});

const receiveTransactionCategories = (transCategories) => ({
    type: RECEIVE_TRANSACTION_CATEGORIES,
    transCategories,
});


export {
    addGroup,
    updateGroup,
    deleteGroup,
    fetchGroups,
    addCategory,
    updateCategory,
    deleteCategory,
    fetchInstitutions,
    receiveCategoryBalances,
    receiveTransactionCategories,
    selectCategory,
    selectAccount,
    receiveSystemIds,
};
