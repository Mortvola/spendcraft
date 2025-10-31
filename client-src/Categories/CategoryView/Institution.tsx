import React from 'react';
import { InstitutionInterface } from '../../State/Types';
import { TrackingType } from '../../../common/ResponseTypes';
import styles from './CategoryView.module.scss';
import Amount from '../../Amount';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useStores } from '../../State/Store';
import { observer } from 'mobx-react-lite';

interface PropsType {
  institution: InstitutionInterface
}

const Institution: React.FC<PropsType> = observer(({
  institution,
}) => {
  const { uiState } = useStores()

  const handleToggle = () => {
    uiState.toggleAccountExpanded(institution.id)
  }

  // Get all the accounts within the institution that 
  // are enabled for categorized transactions.
  const accts = institution.accounts
    .filter((account) => account.tracking === TrackingType.Transactions)

  // Add the institution and the accounts only
  // if the institution had accounts with categorized
  // transactions.
  if (accts.length > 0) {
    return (
      <>
        <div className={styles.institution}>
          <div >
            {
              uiState.accountState.get(institution.id) ?? true
                ? <ChevronDown size={16} strokeWidth={2.5} onClick={handleToggle} />
                : <ChevronRight size={16} strokeWidth={2.5} onClick={handleToggle} />
            }
            {institution.name}
          </div>
          {
            !(uiState.accountState.get(institution.id) ?? true)
              ? <Amount amount={accts.reduce((prev, acct) => (prev + acct.balance), 0)} />
              : null
          }
        </div>
        {
          uiState.accountState.get(institution.id) ?? true
            ? (
              accts.map((account) => (
                <div className={styles.account}>
                  <div>{account.name}</div>
                  <Amount amount={account.balance} />
                </div>
              ))
            )
            : null
        }
      </>
    )
  }

  return null
})

export default Institution;
