import React, { ReactElement } from 'react';

type PropsType = {
  data: Record<string, string>[] | null,
}

const Payee = ({
  data,
}: PropsType): ReactElement | null => (
  data
    ? (
      <div className="payee-report window">
        <div className="title payee-report-item">
          <div>Name</div>
          <div>Mask</div>
          <div>Channel</div>
          <div>Count</div>
        </div>
        <div className="striped">
          {
            data.map((d) => (
              <div key={d.name} className="payee-report-item">
                <div>{d.name}</div>
                <div>{d.mask}</div>
                <div>{d.payment_channel}</div>
                <div style={{ textAlign: 'right' }}>{d.count}</div>
              </div>
            ))
          }
        </div>
      </div>
    )
    : null
)

export default Payee;
