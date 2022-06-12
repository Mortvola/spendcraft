const transactionFields = {
  fields: {
    pick: [
      'id', 'date', 'createdAt', 'sortOrder', 'type', 'comment', 'transactionCategories',
      'duplicateOfTransactionId', 'accountTransaction',
    ],
  },
  relations: {
    transactionCategories: {
      fields: {
        pick: ['id', 'type', 'categoryId', 'amount', 'comment'],
      },
    },
    accountTransaction: {
      fields: {
        pick: ['name', 'amount', 'principle', 'paymentChannel', 'reconciled', 'account'],
      },
      relations: {
        account: {
          fields: {
            pick: ['id', 'name', 'institution'],
          },
          relations: {
            institution: {
              fields: {
                pick: ['name'],
              },
            },
          },
        },
      },
    },
  },
};

export default transactionFields;
