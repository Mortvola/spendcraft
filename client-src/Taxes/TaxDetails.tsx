import { runInAction } from 'mobx';
import React from 'react';
import { useStores } from '../State/Store';
import { observer } from 'mobx-react-lite';
import style from './TaxDetails.module.scss'
import TaxComputation from './TaxComputation';
import Income from './Income';
import TaxAndCredits from './TaxAndCredits';
import { FilingStatus } from '../../common/ResponseTypes';
import { Tab, Tabs } from 'react-bootstrap';
import CapitalGains from './CapitalGains';

const TaxDetails: React.FC = observer(() => {
  const { taxes } = useStores()

  React.useEffect(() => {
    taxes.load()
  }, [taxes])

  const handleFileStatusChange: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
    runInAction(() => {
      taxes.filingStatus = (event.target.value as unknown) as FilingStatus
    })
  }

  const handleSave = () => {
    taxes.save();
  }

  return (
    <div className={style.layout}>
      <div className={style.main}>
        <div>
          <TaxComputation taxes={taxes} />
        </div>

        <div>
          <div className={style.form}>
            <label>
              Filing Status: 
              <select value={taxes.filingStatus} onChange={handleFileStatusChange}>
                <option value={FilingStatus.Single}>Single</option>
                <option value={FilingStatus.MarriedFilingSeparate}>Married Filing Separate</option>
                <option value={FilingStatus.MarriedFilingJointly}>Married Filing Jointly</option>
                <option value={FilingStatus.HeadOfHousehold}>Head of Household</option>
              </select>
            </label>
          </div>

          <div>
            <div>
              <Tabs className="mb-3" mountOnEnter unmountOnExit>
                <Tab eventKey="income" title="Income">
                  <Income taxes={taxes} />
                </Tab>

                <Tab eventKey="tax-and-credits" title="Tax and Credits">
                  <TaxAndCredits taxes={taxes} />
                </Tab>

                <Tab eventKey="capital-gains" title="Capital Gains and Losses">
                  <CapitalGains taxes={taxes} />
                </Tab>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleSave}>Save</button>
    </div>
  )
})

export default TaxDetails;
